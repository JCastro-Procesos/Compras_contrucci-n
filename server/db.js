'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'); const path = require('path');
const crypto = require('crypto');
const DEFAULTS = require('./defaults');

const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'itm-compras.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY, email TEXT UNIQUE, nombre TEXT, roles TEXT, pass TEXT, activo INTEGER DEFAULT 1, intentos INTEGER DEFAULT 0, bloqueado_hasta INTEGER DEFAULT 0, demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sesiones(token TEXT PRIMARY KEY, usuario_id INTEGER, expira INTEGER);
CREATE TABLE IF NOT EXISTS obras(id INTEGER PRIMARY KEY, nombre TEXT, prefijo TEXT UNIQUE, activa INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS proveedores(id INTEGER PRIMARY KEY, nombre TEXT, rfc TEXT, contacto TEXT, correo TEXT, documentos TEXT DEFAULT '[]', estatus TEXT DEFAULT 'En alta', demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS parametros(version INTEGER PRIMARY KEY, json TEXT, usuario TEXT, ts TEXT);
CREATE TABLE IF NOT EXISTS solicitudes(id INTEGER PRIMARY KEY, folio TEXT UNIQUE, obra_id INTEGER, solicitante_id INTEGER, estado TEXT, tipo TEXT, naturaleza TEXT, proveedor_id INTEGER, proveedor_nombre TEXT, proveedor_key TEXT, monto REAL, monto_evaluado REAL, datos TEXT, resultado TEXT, nivel_motor TEXT, nivel_final TEXT, ajuste TEXT, seguimiento TEXT DEFAULT '{}', hitos TEXT DEFAULT '{}', presupuesto_ok INTEGER DEFAULT 0, instrumento_confirmado INTEGER DEFAULT 0, creada TEXT, enviada TEXT, actualizada TEXT, demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS evaluaciones(id INTEGER PRIMARY KEY, solicitud_id INTEGER, version INTEGER, entrada TEXT, resultado TEXT, params TEXT, params_version INTEGER, usuario TEXT, ts TEXT);
CREATE TABLE IF NOT EXISTS revisiones(id INTEGER PRIMARY KEY, solicitud_id INTEGER, area TEXT, disparadores TEXT, estado TEXT DEFAULT 'Pendiente', evidencia_pedida TEXT, texto TEXT, usuario TEXT, creada TEXT, cerrada TEXT);
CREATE TABLE IF NOT EXISTS autorizaciones(id INTEGER PRIMARY KEY, solicitud_id INTEGER, decision TEXT, nombre TEXT, puesto TEXT, comentario TEXT, ts TEXT);
CREATE TABLE IF NOT EXISTS adjuntos(id INTEGER PRIMARY KEY, solicitud_id INTEGER, tipo TEXT, nombre TEXT, archivo TEXT, usuario TEXT, ts TEXT);
CREATE TABLE IF NOT EXISTS correos(id INTEGER PRIMARY KEY, para TEXT, asunto TEXT, cuerpo TEXT, enviado INTEGER DEFAULT 0, error TEXT, ts TEXT);
CREATE TABLE IF NOT EXISTS bitacora(id INTEGER PRIMARY KEY, ts TEXT, usuario TEXT, accion TEXT, entidad TEXT, detalle TEXT);
CREATE TRIGGER IF NOT EXISTS bitacora_no_update BEFORE UPDATE ON bitacora BEGIN SELECT RAISE(ABORT,'La bitacora no se puede modificar'); END;
CREATE TRIGGER IF NOT EXISTS bitacora_no_delete BEFORE DELETE ON bitacora BEGIN SELECT RAISE(ABORT,'La bitacora no se puede borrar'); END;
`);

const now = () => new Date().toISOString();
function hashPass(pw) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); }
function checkPass(pw, stored) { if (!stored) return false; const [salt, h] = stored.split(':'); const x = crypto.scryptSync(pw, salt, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(h,'hex'), Buffer.from(x,'hex')); }

function limpiar(p) {
  // compatibilidad con parametros guardados por versiones anteriores
  p.disparadores = (p.disparadores || DEFAULTS.disparadores).map(t => { const a = t.areas.filter(x => x !== 'finanzas'); return { ...t, areas: a.length ? a : ['legal'] }; });
  if (p.textos && /Precontrato/.test(p.textos.N2 || '')) p.textos.N2 = DEFAULTS.textos.N2;
  delete p.presupuestoFinanzas; delete p.finanzasEditaBandas; return p;
}
function getParams() { const r = db.prepare('SELECT * FROM parametros ORDER BY version DESC LIMIT 1').get(); return r ? limpiar({ ...DEFAULTS, ...JSON.parse(r.json), _version: r.version }) : limpiar({ ...DEFAULTS, _version: 0 }); }
function setParams(p, usuario) { const v = (db.prepare('SELECT MAX(version) v FROM parametros').get().v || 0) + 1; const clean = { ...p }; delete clean._version; db.prepare('INSERT INTO parametros VALUES(?,?,?,?)').run(v, JSON.stringify(clean), usuario, now()); return v; }
function log(usuario, accion, entidad, detalle) { db.prepare('INSERT INTO bitacora(ts,usuario,accion,entidad,detalle) VALUES(?,?,?,?,?)').run(now(), usuario || 'sistema', accion, entidad || '', typeof detalle === 'string' ? detalle : JSON.stringify(detalle || {})); }

function seed() {
  if (!db.prepare('SELECT COUNT(*) n FROM parametros').get().n) setParams(DEFAULTS, 'sistema');
  if (!db.prepare('SELECT COUNT(*) n FROM obras').get().n) db.prepare('INSERT INTO obras(nombre,prefijo) VALUES(?,?)').run('Obra principal (editar en Administración)', 'OBR');
  const email = (process.env.ADMIN_EMAIL || 'admin@itm.local').toLowerCase();
  if (!db.prepare('SELECT COUNT(*) n FROM usuarios').get().n) {
    db.prepare('INSERT INTO usuarios(email,nombre,roles,pass) VALUES(?,?,?,?)').run(email, 'Administrador', JSON.stringify(['admin']), hashPass(process.env.ADMIN_PASSWORD || 'Cambiar-esta-clave-1'));
    log('sistema', 'seed', 'usuarios', 'Administrador inicial ' + email);
  }
  if (process.env.SEED_DEMO === '1' && !db.prepare("SELECT COUNT(*) n FROM usuarios WHERE demo=1").get().n) {
    const mk = (e, n, r) => db.prepare('INSERT INTO usuarios(email,nombre,roles,pass,demo) VALUES(?,?,?,?,1)').run(e, n, JSON.stringify(r), hashPass('demo1234'));
    mk('solicitante@itm.local','Demo Solicitante',['solicitante']); mk('compras@itm.local','Demo Compras',['compras']); mk('legal@itm.local','Demo Legal',['legal']);
    mk('ti@itm.local','Demo TI',['ti']); mk('obra@itm.local','Demo Dirección de Obra',['direccion_obra']);
    db.prepare('INSERT INTO proveedores(nombre,rfc,correo,estatus,demo) VALUES(?,?,?,?,1)').run('Aceros del Caribe (demo)', 'ACA010101AAA', 'ventas@aceros.demo', 'Activo');
    db.prepare('INSERT INTO proveedores(nombre,rfc,correo,estatus,demo) VALUES(?,?,?,?,1)').run('Maquinaria Usada Peninsular (demo)', 'MUP020202BBB', 'contacto@mup.demo', 'Activo');
  }
}
db.prepare("UPDATE revisiones SET area='compras' WHERE area='finanzas' AND estado='Pendiente'").run();
seed();
module.exports = { db, now, hashPass, checkPass, getParams, setParams, log, DATA };
