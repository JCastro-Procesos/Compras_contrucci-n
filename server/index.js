'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { db, now, hashPass, checkPass, getParams, setParams, log, DATA } = require('./db');
const { evaluar, puedeAjustar, derivarDisparadores, construirPuntuaciones, NIVEL, NOMBRE_NIVEL } = require('./engine');
const { enviarCorreo } = require('./mail');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PUB = path.join(__dirname, '..', 'public');
const J = x => JSON.stringify(x); const P = s => (s ? JSON.parse(s) : null);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const ROLES = ['solicitante','compras','legal','finanzas','ti','direccion_obra','admin'];
class HttpErr extends Error { constructor(c, m) { super(m); this.code = c; } }
const bad = m => new HttpErr(400, m), forb = m => new HttpErr(403, m || 'No tienes permiso para esto');

// ---------- utilidades ----------
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0,i).trim()] = decodeURIComponent(c.slice(i+1)); }); return o; }
function userFrom(req) {
  const t = cookies(req).sid; if (!t) return null;
  const s = db.prepare('SELECT * FROM sesiones WHERE token=? AND expira>?').get(t, Date.now()); if (!s) return null;
  const u = db.prepare('SELECT * FROM usuarios WHERE id=? AND activo=1').get(s.usuario_id); if (!u) return null;
  return { id: u.id, email: u.email, nombre: u.nombre, roles: P(u.roles) };
}
const has = (u, ...r) => u.roles.includes('admin') || r.some(x => u.roles.includes(x));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function body(req) { return new Promise((res, rej) => { let b = ''; req.on('data', c => { b += c; if (b.length > 16e6) { rej(bad('Archivo demasiado grande')); req.destroy(); } }); req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch { rej(bad('JSON inválido')); } }); }); }
function send(res, code, obj, headers) { const h = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers }; res.writeHead(code, h); res.end(J(obj)); }
const mesesAtras = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString(); };

// ---------- logica de solicitudes ----------
function acumulado(params, obraId, provKey, excluirId) {
  if (!provKey) return 0;
  const r = db.prepare(`SELECT COALESCE(SUM(monto),0) s FROM solicitudes WHERE obra_id=? AND proveedor_key=? AND id<>? AND estado NOT IN ('Cancelada','Rechazada','Borrador') AND enviada>=?`).get(obraId, provKey, excluirId || 0, mesesAtras(params.ventanaMeses));
  return r.s;
}
function estadoDisparadores(solId, disparadores) {
  const revs = solId ? db.prepare('SELECT * FROM revisiones WHERE solicitud_id=?').all(solId) : [];
  const out = {};
  for (const [k, v] of Object.entries(disparadores || {})) {
    const rel = revs.filter(r => P(r.disparadores).includes(Number(k)));
    out[k] = { ...v, estado: v.valor === 'si' ? (rel.length && rel.every(r => r.estado === 'Atendida') ? 'Atendida' : 'Pendiente') : 'No requerida' };
  }
  return out;
}
function entradaMotor(d, params, solId) {
  const prov = d.proveedorNuevo && d.proveedorNuevo.nombre ? d.proveedorNuevo.nombre : (d.proveedorId ? (db.prepare('SELECT nombre FROM proveedores WHERE id=?').get(d.proveedorId) || {}).nombre : '');
  const key = norm(prov); const monto = Number(d.monto) || 0;
  const acum = acumulado(params, Number(d.obraId), key, solId);
  const tipo = params.tipos.find(t => t.id === d.tipoCompra);
  const entrada = { tipoCompra: d.tipoCompra, montoEvaluado: monto + acum, acumulado: acum, gates: d.gates || {}, scores: d.scores || {}, evidencias: d.evidencias || {}, exclusiones: d.exclusiones || {}, e1Manual: d.e1Manual };
  entrada.disparadores = estadoDisparadores(solId, derivarDisparadores(construirPuntuaciones(entrada, params).scores, d.disparadoresManual));
  return { entrada, provNombre: prov, provKey: key, monto, tipo };
}
function validarDatos(d, params, enviar) {
  if (!d.obraId) throw bad('Selecciona la obra'); if (!d.tipoCompra || !params.tipos.find(t => t.id === d.tipoCompra)) throw bad('Selecciona el tipo de compra');
  if (enviar) {
    if (!String(d.descripcion || '').trim()) throw bad('Falta la descripción y alcance'); if (!(Number(d.monto) > 0)) throw bad('Falta el monto estimado');
    if (!d.proveedorId && !(d.proveedorNuevo && d.proveedorNuevo.nombre)) throw bad('Indica el proveedor (existente o nuevo)');
    if (!d.cotizacion && !d.cotizacionAdjunta) throw bad('Adjunta la cotización');
  }
}
function guardarAdjunto(solId, tipo, a, usuario) {
  if (!a || !a.base64) return;
  const ok = ['.pdf','.jpg','.jpeg','.png','.xlsx','.docx']; const ext = path.extname(a.nombre || '').toLowerCase();
  if (!ok.includes(ext)) throw bad('Tipo de archivo no permitido (PDF, JPG, PNG, XLSX, DOCX)');
  const buf = Buffer.from(a.base64, 'base64'); if (buf.length > 10 * 1024 * 1024) throw bad('El archivo excede 10 MB');
  const fn = crypto.randomBytes(12).toString('hex') + ext; fs.writeFileSync(path.join(DATA, 'uploads', fn), buf);
  db.prepare('INSERT INTO adjuntos(solicitud_id,tipo,nombre,archivo,usuario,ts) VALUES(?,?,?,?,?,?)').run(solId, tipo, path.basename(a.nombre), fn, usuario, now());
}
function rolesUsuarios(roles) { return db.prepare('SELECT email FROM usuarios WHERE activo=1').all().map(r => r.email).length ? db.prepare('SELECT email,roles FROM usuarios WHERE activo=1').all().filter(u => P(u.roles).some(r => roles.includes(r))).map(u => u.email) : []; }
function aviso(roles, asunto, html, adj) { const to = [...new Set(rolesUsuarios(roles))]; if (to.length) enviarCorreo(to.join(','), asunto, html, adj); }
function nuevoFolio(obraId) {
  const o = db.prepare('SELECT prefijo FROM obras WHERE id=?').get(obraId); const y = new Date().getFullYear(); const pre = `${o.prefijo}-${y}-`;
  const n = db.prepare('SELECT COUNT(*) n FROM solicitudes WHERE folio LIKE ?').get(pre + '%').n + 1; return pre + String(n).padStart(4, '0');
}
function tareasRevision(solId, res, params, extra) {
  const trig = res.disparadoresSi || []; const areas = {};
  const defs = params.disparadores;
  for (const t of trig) { const def = defs.find(x => x.id === t); for (const a of def.areas) { (areas[a] = areas[a] || { d: [], ev: [] }); areas[a].d.push(t); areas[a].ev.push(`#${t}: ${def.evidencia}`); } }
  const modo = params.revisionLegal[res.nivelFinal];
  if (modo === 'siempre' || extra) { (areas.legal = areas.legal || { d: [], ev: [] }); areas.legal.ev.push(extra ? 'Revisión solicitada de forma opcional' : `Revisión obligatoria del instrumento (${NOMBRE_NIVEL[res.nivelFinal]})`); }
  for (const [a, v] of Object.entries(areas)) {
    const ya = db.prepare("SELECT id FROM revisiones WHERE solicitud_id=? AND area=? AND estado='Pendiente'").get(solId, a); if (ya) continue;
    db.prepare('INSERT INTO revisiones(solicitud_id,area,disparadores,evidencia_pedida,creada) VALUES(?,?,?,?,?)').run(solId, a, J(v.d), v.ev.join(' | '), now());
    aviso([a], `Tarea de revision pendiente - ${db.prepare('SELECT folio FROM solicitudes WHERE id=?').get(solId).folio}`, `<p>Se te asignó una revisión (${a}). Entra a la herramienta: <a href="${BASE_URL}/#/s/${solId}">abrir solicitud</a>.</p><p>${v.ev.join('<br>')}</p>`);
  }
}
function recalcular(solId, usuario) {
  const s = db.prepare('SELECT * FROM solicitudes WHERE id=?').get(solId); const params = getParams(); const d = P(s.datos);
  const { entrada } = entradaMotor(d, params, solId); const res = evaluar(entrada, params);
  const ajuste = P(s.ajuste); const final = ajuste ? ajuste.nivel : res.nivelFinal;
  db.prepare('UPDATE solicitudes SET resultado=?, nivel_motor=?, nivel_final=?, monto_evaluado=?, actualizada=? WHERE id=?').run(J(res), res.nivelFinal || null, final || null, entrada.montoEvaluado, now(), solId);
  return res;
}
function hito(s, k) { const h = P(s.hitos) || {}; if (!h[k]) h[k] = now(); db.prepare('UPDATE solicitudes SET hitos=? WHERE id=?').run(J(h), s.id); }
function setEstado(solId, estado, usuario, det) { db.prepare('UPDATE solicitudes SET estado=?, actualizada=? WHERE id=?').run(estado, now(), solId); log(usuario, 'estado', 'solicitud ' + solId, estado + (det ? ': ' + det : '')); }
function pendientes(solId) { return db.prepare("SELECT COUNT(*) n FROM revisiones WHERE solicitud_id=? AND estado='Pendiente'").get(solId).n; }
function resumenHtml(s, res, d, params, u) {
  const o = db.prepare('SELECT nombre FROM obras WHERE id=?').get(s.obra_id);
  const tipo = params.tipos.find(t => t.id === s.tipo);
  return `<h2>${s.folio} - Solicitud de compra</h2><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
<tr><td><b>Solicitante</b></td><td>${u.nombre} (${u.email})</td></tr><tr><td><b>Obra</b></td><td>${o.nombre}</td></tr>
<tr><td><b>Tipo</b></td><td>${tipo.nombre} (${tipo.naturaleza})</td></tr><tr><td><b>Proveedor</b></td><td>${s.proveedor_nombre}</td></tr>
<tr><td><b>Monto / evaluado</b></td><td>USD ${s.monto.toLocaleString('en-US')} / USD ${s.monto_evaluado.toLocaleString('en-US')} (acumulado USD ${(s.monto_evaluado - s.monto).toLocaleString('en-US')})</td></tr>
<tr><td><b>Clasificación</b></td><td>${res.clasificacion} - ${res.total}/12</td></tr><tr><td><b>Instrumento sugerido</b></td><td><b>${res.instrumento}</b><br>${res.reglaDeterminante}</td></tr>
<tr><td><b>Disparadores</b></td><td>${(res.disparadoresSi || []).length ? res.disparadoresSi.map(t => params.disparadores.find(x => x.id === t).nombre).join('; ') : 'Ninguno'}</td></tr>
<tr><td><b>Descripción</b></td><td>${String(d.descripcion).replace(/</g, '&lt;')}</td></tr></table>
<p><a href="${BASE_URL}/#/s/${s.id}">Abrir solicitud en la herramienta</a></p>`;
}

// ---------- API ----------
const routes = [];
const R = (m, p, fn, auth = true) => routes.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, auth });

R('POST', '/api/login', async (req, res, ctx) => {
  const { email, password } = ctx.body; const params = getParams();
  const e = String(email || '').trim().toLowerCase(); const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get(e);
  if (u && u.bloqueado_hasta > Date.now()) throw new HttpErr(429, 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta en unos minutos.');
  if (!u || !u.activo || !checkPass(String(password || ''), u.pass)) { if (u) { const n = u.intentos + 1; db.prepare('UPDATE usuarios SET intentos=?, bloqueado_hasta=? WHERE id=?').run(n >= 5 ? 0 : n, n >= 5 ? Date.now() + 15 * 60000 : 0, u.id); } log(e, 'login_fallido', 'usuarios', ''); throw new HttpErr(401, 'Correo o contraseña incorrectos'); }
  if (params.dominioCorreo && !e.endsWith('@' + params.dominioCorreo.toLowerCase()) && !has({ roles: P(u.roles) })) throw new HttpErr(401, 'Usa tu correo corporativo');
  db.prepare('UPDATE usuarios SET intentos=0 WHERE id=?').run(u.id);
  const token = crypto.randomBytes(32).toString('hex'); db.prepare('INSERT INTO sesiones VALUES(?,?,?)').run(token, u.id, Date.now() + 12 * 3600e3);
  log(e, 'login', 'usuarios', '');
  send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}` });
}, false);
R('POST', '/api/logout', async (req, res, ctx) => { const t = cookies(req).sid; if (t) db.prepare('DELETE FROM sesiones WHERE token=?').run(t); send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' }); }, false);
R('GET', '/api/me', async (req, res, ctx) => { const params = getParams(); send(res, 200, { usuario: ctx.u, params, obras: db.prepare('SELECT * FROM obras WHERE activa=1').all(), proveedores: db.prepare("SELECT id,nombre,rfc,estatus FROM proveedores WHERE estatus<>'Bloqueado' ORDER BY nombre").all() }); });
R('POST', '/api/cambiar-clave', async (req, res, ctx) => { const { actual, nueva } = ctx.body; const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(ctx.u.id); if (!checkPass(actual || '', u.pass)) throw bad('La contraseña actual no coincide'); if (String(nueva || '').length < 10) throw bad('Mínimo 10 caracteres'); db.prepare('UPDATE usuarios SET pass=? WHERE id=?').run(hashPass(nueva), u.id); log(ctx.u.email, 'cambio_clave', 'usuarios', ''); send(res, 200, { ok: true }); });

// vista previa del motor (no guarda)
R('POST', '/api/evaluar', async (req, res, ctx) => {
  const params = getParams(); const d = ctx.body; validarDatos(d, params, false);
  if (d.e1Manual != null && !has(ctx.u, 'compras', 'finanzas')) delete d.e1Manual;
  const { entrada, provNombre } = entradaMotor(d, params, d.id); send(res, 200, { resultado: evaluar(entrada, params), acumulado: entrada.acumulado, montoEvaluado: entrada.montoEvaluado });
});

// crear / guardar borrador / enviar
R('POST', '/api/solicitudes', async (req, res, ctx) => {
  const params = getParams(); const d = ctx.body.datos; const enviar = !!ctx.body.enviar; const u = ctx.u;
  if (!has(u, 'solicitante', 'compras')) throw forb();
  validarDatos(d, params, enviar); delete d.e1Manual;
  if (d.cotizacion) { d.cotizacionAdjunta = d.cotizacion.nombre; }
  const cot = d.cotizacion; delete d.cotizacion;
  const { entrada, provNombre, provKey, monto, tipo } = entradaMotor(d, params, d.id || 0);
  let id = d.id;
  if (id) { const s0 = db.prepare('SELECT * FROM solicitudes WHERE id=?').get(id); if (!s0 || s0.solicitante_id !== u.id || s0.estado !== 'Borrador') throw forb('Solo puedes editar tus borradores'); }
  const res0 = evaluar(entrada, params);
  if (enviar) {
    if (res0.estado === 'PENDIENTE') throw bad('La evaluación esta pendiente: ' + res0.faltantes.join('; '));
    for (const g of Object.values(entrada.gates)) if (g === 'nose') throw bad('Hay respuestas "No se": aclaralas antes de enviar');
  }
  const jd = J(d);
  if (!id) { const r = db.prepare('INSERT INTO solicitudes(obra_id,solicitante_id,estado,tipo,naturaleza,proveedor_id,proveedor_nombre,proveedor_key,monto,monto_evaluado,datos,creada,actualizada) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(Number(d.obraId), u.id, 'Borrador', d.tipoCompra, tipo.naturaleza, d.proveedorId || null, provNombre, provKey, monto, entrada.montoEvaluado, jd, now(), now()); id = Number(r.lastInsertRowid); }
  else db.prepare('UPDATE solicitudes SET obra_id=?,tipo=?,naturaleza=?,proveedor_id=?,proveedor_nombre=?,proveedor_key=?,monto=?,monto_evaluado=?,datos=?,actualizada=? WHERE id=?').run(Number(d.obraId), d.tipoCompra, tipo.naturaleza, d.proveedorId || null, provNombre, provKey, monto, entrada.montoEvaluado, jd, now(), id);
  if (cot) guardarAdjunto(id, 'cotizacion', cot, u.email);
  if (!enviar) { log(u.email, 'borrador', 'solicitud ' + id, ''); return send(res, 200, { id, estado: 'Borrador' }); }
  // envio
  const s = db.prepare('SELECT * FROM solicitudes WHERE id=?').get(id);
  const folio = nuevoFolio(s.obra_id); db.prepare('UPDATE solicitudes SET folio=?, enviada=?, estado=? WHERE id=?').run(folio, now(), 'En análisis de Compras', id);
  const ev = recalcular(id, u.email);
  const v = db.prepare('SELECT COALESCE(MAX(version),0)+1 v FROM evaluaciones WHERE solicitud_id=?').get(id).v;
  db.prepare('INSERT INTO evaluaciones(solicitud_id,version,entrada,resultado,params,params_version,usuario,ts) VALUES(?,?,?,?,?,?,?,?)').run(id, v, J(entrada), J(ev), J(params), params._version, u.email, now());
  tareasRevision(id, ev, params);
  const s2 = db.prepare('SELECT * FROM solicitudes WHERE id=?').get(id);
  if (pendientes(id)) setEstado(id, 'Bloqueada por revisión especializada', u.email, 'tareas de revisión creadas');
  log(u.email, 'enviar', 'solicitud ' + folio, { instrumento: ev.instrumento, monto });
  const att = db.prepare("SELECT * FROM adjuntos WHERE solicitud_id=? AND tipo='cotizacion'").all(id).map(a => ({ filename: a.nombre, path: path.join(DATA, 'uploads', a.archivo) }));
  aviso(['compras'], `[${folio}] Solicitud de compra – ${tipo.nombre} – ${provNombre} – USD ${monto.toLocaleString('en-US')}`, resumenHtml(s2, ev, d, params, u), att);
  send(res, 200, { id, folio, estado: db.prepare('SELECT estado FROM solicitudes WHERE id=?').get(id).estado, resultado: ev });
});

R('GET', '/api/solicitudes', async (req, res, ctx) => {
  let rows = db.prepare('SELECT s.*, o.nombre obra, u.nombre solicitante FROM solicitudes s JOIN obras o ON o.id=s.obra_id JOIN usuarios u ON u.id=s.solicitante_id ORDER BY s.id DESC').all();
  if (!has(ctx.u, 'compras', 'legal', 'ti', 'direccion_obra')) rows = rows.filter(r => r.solicitante_id === ctx.u.id);
  send(res, 200, rows.map(r => ({ id: r.id, folio: r.folio, obra: r.obra, solicitante: r.solicitante, estado: r.estado, tipo: r.tipo, naturaleza: r.naturaleza, proveedor: r.proveedor_nombre, monto: r.monto, montoEvaluado: r.monto_evaluado, nivel: r.nivel_final, enviada: r.enviada, creada: r.creada, bloqueada: r.estado.startsWith('Bloqueada'), clasificacion: (P(r.resultado) || {}).clasificacion })));
});
function cargar(id, u) {
  const s = db.prepare('SELECT s.*, o.nombre obra, us.nombre solicitante, us.email solicitante_email FROM solicitudes s JOIN obras o ON o.id=s.obra_id JOIN usuarios us ON us.id=s.solicitante_id WHERE s.id=?').get(id);
  if (!s) throw new HttpErr(404, 'No existe la solicitud');
  if (!has(u, 'compras', 'legal', 'ti', 'direccion_obra') && s.solicitante_id !== u.id) throw forb();
  return s;
}
R('GET', '/api/solicitudes/:id', async (req, res, ctx) => {
  const s = cargar(ctx.p.id, ctx.u);
  send(res, 200, { solicitud: { ...s, datos: P(s.datos), resultado: P(s.resultado), ajuste: P(s.ajuste), seguimiento: P(s.seguimiento), hitos: P(s.hitos) },
    evaluaciones: db.prepare('SELECT id,version,resultado,params_version,usuario,ts FROM evaluaciones WHERE solicitud_id=? ORDER BY version DESC').all(s.id).map(e => ({ ...e, resultado: P(e.resultado) })),
    revisiones: db.prepare('SELECT * FROM revisiones WHERE solicitud_id=? ORDER BY id').all(s.id).map(r => ({ ...r, disparadores: P(r.disparadores) })),
    autorizaciones: db.prepare('SELECT * FROM autorizaciones WHERE solicitud_id=?').all(s.id),
    adjuntos: db.prepare('SELECT id,tipo,nombre,usuario,ts FROM adjuntos WHERE solicitud_id=?').all(s.id),
    bitacora: db.prepare('SELECT ts,usuario,accion,detalle FROM bitacora WHERE entidad IN (?,?) ORDER BY id DESC').all('solicitud ' + s.id, 'solicitud ' + s.folio) });
});

R('POST', '/api/solicitudes/:id/accion', async (req, res, ctx) => {
  const u = ctx.u, b = ctx.body; const s = cargar(ctx.p.id, u); const params = getParams(); const id = s.id; const jus = String(b.justificacion || '').trim();
  const bloq = () => pendientes(id) > 0;
  const solo = (...r) => { if (!has(u, ...r)) throw forb(); };
  const activa = !['Cancelada', 'Rechazada', 'Cerrada', 'Borrador'].includes(s.estado);
  if (!activa && b.accion !== 'cancelar') throw bad('La solicitud ya no admite cambios');
  switch (b.accion) {
    case 'ajustar_instrumento': {
      solo('compras', 'legal'); const actual = s.nivel_final; if (!puedeAjustar(u.roles, actual, b.nivel)) throw forb(u.roles.includes('compras') ? 'Compras solo puede subir el instrumento; bajarlo lo hace Legal' : undefined);
      if (!jus) throw bad('La justificación es obligatoria');
      db.prepare('UPDATE solicitudes SET ajuste=?, nivel_final=?, instrumento_confirmado=0, actualizada=? WHERE id=?').run(J({ nivel: b.nivel, de: s.nivel_motor, por: u.email, justificacion: jus, ts: now() }), b.nivel, now(), id);
      log(u.email, 'ajuste_instrumento', 'solicitud ' + s.folio, { de: actual, a: b.nivel, justificacion: jus });
      const ev = P(db.prepare('SELECT resultado FROM solicitudes WHERE id=?').get(id).resultado); ev.nivelFinal = b.nivel; tareasRevision(id, { ...ev, nivelFinal: b.nivel }, params); if (bloq() && s.estado !== 'Bloqueada por revisión especializada') setEstado(id, 'Bloqueada por revisión especializada', u.email);
      break; }
    case 'confirmar_instrumento': solo('compras', 'legal'); db.prepare('UPDATE solicitudes SET instrumento_confirmado=1 WHERE id=?').run(id); hito(s, 'confirmado'); log(u.email, 'confirmar_instrumento', 'solicitud ' + s.folio, s.nivel_final); if (!bloq() && s.estado === 'En análisis de Compras') setEstado(id, 'En formalización', u.email); break;
    case 'proveedor': solo('compras'); { const nom = String(b.nombre || '').trim(); if (!nom) throw bad('Falta el nombre del proveedor'); let pid = b.proveedorId; if (!pid) { const r = db.prepare("INSERT INTO proveedores(nombre,rfc,contacto,correo,estatus) VALUES(?,?,?,?,'En alta')").run(nom, b.rfc || '', b.contacto || '', b.correo || ''); pid = Number(r.lastInsertRowid); } db.prepare('UPDATE solicitudes SET proveedor_id=?, proveedor_nombre=?, proveedor_key=? WHERE id=?').run(pid, nom, norm(nom), id); log(u.email, 'proveedor', 'solicitud ' + s.folio, nom); } break;
    case 'solicitar_legal': { if (!has(u, 'compras', 'solicitante', 'legal')) throw forb(); if (params.revisionLegal[s.nivel_final] === 'ninguna') throw bad('Para este nivel Legal no esta habilitado'); const ev = P(s.resultado); tareasRevision(id, { ...ev, nivelFinal: s.nivel_final, disparadoresSi: [] }, params, true); log(u.email, 'solicitar_legal', 'solicitud ' + s.folio, ''); if (bloq()) setEstado(id, 'Bloqueada por revisión especializada', u.email); break; }
    case 'atender_revision': {
      const r = db.prepare('SELECT * FROM revisiones WHERE id=? AND solicitud_id=?').get(b.revisionId, id); if (!r) throw bad('Revisión no encontrada'); solo(r.area); if (r.estado === 'Atendida') throw bad('Ya estaba atendida');
      if (!String(b.texto || '').trim()) throw bad('Documenta los controles aplicados'); db.prepare("UPDATE revisiones SET estado='Atendida', texto=?, usuario=?, cerrada=? WHERE id=?").run(b.texto, u.email, now(), r.id);
      if (b.adjunto) guardarAdjunto(id, 'revision', b.adjunto, u.email);
      log(u.email, 'revision_atendida', 'solicitud ' + s.folio, { area: r.area });
      const ev = recalcular(id, u.email); if (!bloq() && s.estado.startsWith('Bloqueada')) { setEstado(id, s.instrumento_confirmado ? 'En formalización' : 'En análisis de Compras', u.email, 'revisiones cerradas'); aviso(['compras'], `[${s.folio}] Revisiones cerradas`, `<p>Ya se pueden continuar los pasos de compra. <a href="${BASE_URL}/#/s/${id}">Abrir</a></p>`); }
      break; }
    case 'ajustar_disparadores': {
      solo('compras', 'legal'); if (!jus) throw bad('La justificación es obligatoria'); const d = P(s.datos); d.disparadoresManual = { ...(d.disparadoresManual || {}) };
      for (const [k, v] of Object.entries(b.valores || {})) if (['si', 'no'].includes(v)) d.disparadoresManual[k] = v;
      db.prepare('UPDATE solicitudes SET datos=? WHERE id=?').run(J(d), id); log(u.email, 'ajuste_disparadores', 'solicitud ' + s.folio, { valores: b.valores, justificacion: jus });
      let ev = recalcular(id, u.email); const si = ev.disparadoresSi || [];
      for (const r of db.prepare("SELECT * FROM revisiones WHERE solicitud_id=? AND estado='Pendiente'").all(id)) { const ids = P(r.disparadores); if (ids.length && !ids.some(t => si.includes(t)) && !/obligatoria del instrumento|forma opcional/.test(r.evidencia_pedida)) db.prepare("UPDATE revisiones SET estado='Atendida', texto=?, usuario=?, cerrada=? WHERE id=?").run('Disparador retirado por ' + u.email + ': ' + jus, u.email, now(), r.id); }
      tareasRevision(id, ev, params); recalcular(id, u.email);
      if (bloq() && !s.estado.startsWith('Bloqueada')) setEstado(id, 'Bloqueada por revisión especializada', u.email); else if (!bloq() && s.estado.startsWith('Bloqueada')) setEstado(id, s.instrumento_confirmado ? 'En formalización' : 'En análisis de Compras', u.email);
      break; }
    case 'validar_presupuesto': solo('compras'); db.prepare('UPDATE solicitudes SET presupuesto_ok=1 WHERE id=?').run(id); log(u.email, 'validar_presupuesto', 'solicitud ' + s.folio, b.comentario || ''); break;
    case 'enviar_autorizacion': {
      solo('compras'); if (bloq()) throw bad('Hay revisiones especializadas pendientes'); if (!s.instrumento_confirmado) throw bad('Confirma primero el instrumento'); if (params.presupuestoCompras && !s.presupuesto_ok) throw bad('Falta validar el presupuesto');
      setEstado(id, 'Pendiente de autorización', u.email); const rol = params.autorizacion[s.nivel_final] || 'direccion_obra'; aviso([rol], `[${s.folio}] Pendiente de tu autorización`, `<p>Hay una solicitud por autorizar (${NOMBRE_NIVEL[s.nivel_final]}, USD ${s.monto.toLocaleString('en-US')}). <a href="${BASE_URL}/#/s/${id}">Abrir</a></p>`); break; }
    case 'autorizar': {
      const rol = params.autorizacion[s.nivel_final] || 'direccion_obra'; solo(rol); if (s.estado !== 'Pendiente de autorización') throw bad('No está pendiente de autorización');
      if (!['Aprobada', 'Aprobada con condiciones', 'Rechazada'].includes(b.decision)) throw bad('Decisión inválida'); if (b.decision !== 'Aprobada' && !String(b.comentario || '').trim()) throw bad('Agrega un comentario');
      db.prepare('INSERT INTO autorizaciones(solicitud_id,decision,nombre,puesto,comentario,ts) VALUES(?,?,?,?,?,?)').run(id, b.decision, u.nombre, b.puesto || '', b.comentario || '', now());
      hito(s, 'autorizada'); setEstado(id, b.decision === 'Rechazada' ? 'Rechazada' : 'Autorizada', u.email, b.decision);
      enviarCorreo(s.solicitante_email, `[${s.folio}] ${b.decision}`, `<p>Tu solicitud ${s.folio} fue: <b>${b.decision}</b>. ${b.comentario || ''}</p>`); break; }
    case 'requisicion': case 'orden_compra': case 'pago': {
      solo('compras'); if (bloq()) throw bad('Solicitud bloqueada por revisión especializada'); if (!['Autorizada', 'En ejecución'].includes(s.estado)) throw bad('Primero debe estar autorizada');
      const seg = P(s.seguimiento) || {}; if (b.accion === 'orden_compra' && !seg.requisicion) throw bad('Registra primero la requisición'); if (b.accion === 'pago' && !seg.orden_compra) throw bad('Registra primero la orden de compra');
      seg[b.accion] = { ref: b.referencia || '', fecha: now(), usuario: u.email }; db.prepare('UPDATE solicitudes SET seguimiento=? WHERE id=?').run(J(seg), id); if (b.accion === 'orden_compra') hito(s, 'orden_compra'); setEstado(id, 'En ejecución', u.email, b.accion); break; }
    case 'recepcion': { if (u.id !== s.solicitante_id && !has(u, 'compras')) throw forb(); const seg = P(s.seguimiento) || {}; if (!seg.pago) throw bad('Falta el registro de pago'); seg.recepcion = { fecha: now(), usuario: u.email, nota: b.nota || '' }; db.prepare('UPDATE solicitudes SET seguimiento=? WHERE id=?').run(J(seg), id); hito(s, 'cerrada'); setEstado(id, 'Cerrada', u.email); break; }
    case 'cancelar': { if (u.id !== s.solicitante_id && !has(u, 'compras')) throw forb(); if (!jus) throw bad('Indica el motivo'); setEstado(id, 'Cancelada', u.email, jus); break; }
    case 'reevaluar': { solo('compras', 'legal'); if (b.e1Manual != null) { if (!has(u, 'compras') || !jus) throw bad('Ajustar E1 requiere Compras o Finanzas y justificación'); const d = P(s.datos); d.e1Manual = Number(b.e1Manual); db.prepare('UPDATE solicitudes SET datos=? WHERE id=?').run(J(d), id); log(u.email, 'ajuste_E1', 'solicitud ' + s.folio, { e1: b.e1Manual, justificacion: jus }); }
      const ev = recalcular(id, u.email); const sn = db.prepare('SELECT * FROM solicitudes WHERE id=?').get(id); const d2 = P(sn.datos); const { entrada } = entradaMotor(d2, params, id);
      const v = db.prepare('SELECT COALESCE(MAX(version),0)+1 v FROM evaluaciones WHERE solicitud_id=?').get(id).v; db.prepare('INSERT INTO evaluaciones(solicitud_id,version,entrada,resultado,params,params_version,usuario,ts) VALUES(?,?,?,?,?,?,?,?)').run(id, v, J(entrada), J(ev), J(params), params._version, u.email, now()); tareasRevision(id, ev, params); log(u.email, 'reevaluar', 'solicitud ' + s.folio, 'versión ' + v); break; }
    default: throw bad('Acción desconocida');
  }
  send(res, 200, { ok: true });
});

const ORD = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA', 'DÉCIMA PRIMERA', 'DÉCIMA SEGUNDA', 'DÉCIMA TERCERA', 'DÉCIMA CUARTA', 'DÉCIMA QUINTA', 'DÉCIMA SEXTA'];
function enLetras(n) {
  const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']; const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const b100 = x => x === 100 ? 'CIEN' : x < 30 ? U[x] : x < 100 ? D[Math.floor(x / 10)] + (x % 10 ? ' Y ' + U[x % 10] : '') : C[Math.floor(x / 100)] + (x % 100 ? ' ' + b100(x % 100) : '');
  const b1000 = x => x < 1000 ? b100(x) : (x < 2000 ? 'MIL' : b100(Math.floor(x / 1000)) + ' MIL') + (x % 1000 ? ' ' + b100(x % 1000) : '');
  n = Math.round(n); if (n === 0) return 'CERO'; if (n >= 1e6) { const m = Math.floor(n / 1e6); return (m === 1 ? 'UN MILLÓN' : b1000(m) + ' MILLONES') + (n % 1e6 ? ' ' + b1000(n % 1e6) : ''); } return b1000(n);
}
R('GET', '/api/solicitudes/:id/contrato', async (req, res, ctx) => {
  if (!has(ctx.u, 'compras', 'legal')) throw forb(); const s = cargar(ctx.p.id, ctx.u); const P_ = getParams(); const d = P(s.datos); const T = P_.plantillaContrato;
  if (s.nivel_final !== 'N2') throw bad('El generador aplica a solicitudes con Contrato simplificado'); if (!s.folio) throw bad('La solicitud aún no tiene folio');
  const prov = s.proveedor_id ? db.prepare('SELECT * FROM proveedores WHERE id=?').get(s.proveedor_id) : null; const ev = d.evidencias || {}; const falt = new Set(); const PC = '[POR COMPLETAR]';
  const unir = (...ids) => ids.map(i => ev[i]).filter(x => x && !/^Declarado por/.test(x)).join('; ') || PC;
  const hoy = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Cancun', day: '2-digit', month: '2-digit', year: 'numeric' });
  const f = x => x ? new Date(x).toLocaleDateString('es-MX', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }) : PC;
  const V = { folio: s.folio, tipo_contrato: P_.tiposContrato[s.tipo] || 'SUMINISTRO Y/O PRESTACIÓN DE SERVICIOS', razon_social_itm: P_.razonSocialITM, representante_itm: P_.representanteITM, proveedor: s.proveedor_nombre, rfc_proveedor: (prov && prov.rfc) || (d.proveedorNuevo && d.proveedorNuevo.rfc) || PC, representante_proveedor: '[REPRESENTANTE LEGAL DEL PROVEEDOR]', obra: s.obra, descripcion: d.descripcion, cantidad: d.cantidad || PC, unidad: d.unidad || '', lugar_entrega: d.lugarEntrega || PC, monto: Number(s.monto).toLocaleString('en-US', { minimumFractionDigits: 2 }), monto_letra: enLetras(s.monto) + ' DÓLARES 00/100 USD', forma_pago: d.formaPago || PC, vigencia_inicio: f(d.vigenciaInicio), vigencia_fin: f(d.vigenciaFin), fecha_requerida: f(d.fechaRequerida), garantia: d.garantia || PC, detalle_anticipos: unir('E2'), detalle_penalizaciones: unir('E3'), detalle_accesos: unir('T1', 'T2'), detalle_condiciones_especiales: unir('J3'), ciudad_jurisdiccion: P_.ciudadJurisdiccion, fecha: hoy };
  const sub = t => String(t).replace(/\{\{(\w+)\}\}/g, (m, k) => { const v = V[k]; if (v === undefined || v === '') { falt.add(k); return PC; } if (String(v).includes(PC) || /^\[.*\]$/.test(String(v))) falt.add(k); return v; });
  const act = T.clausulas.filter(c => c.cuando === 'siempre' || (d.gates || {})[c.cuando] === 'si');
  const cuerpo = [sub(T.encabezado), sub(T.declaraciones), 'CLÁUSULAS', ...act.map((c, i) => `${ORD[i] || (i + 1)}.- ${c.titulo.toUpperCase()}.\n${sub(c.texto)}`), sub(T.cierre)].join('\n\n');
  log(ctx.u.email, 'contrato_generado', 'solicitud ' + s.id, s.folio);
  send(res, 200, { folio: s.folio, titulo: 'Contrato simplificado – ' + s.folio, aviso: 'BORRADOR PARA VALIDACIÓN DE LEGAL. Generado con la información de la solicitud; los campos [POR COMPLETAR] requieren datos adicionales.', texto: cuerpo, pendientes: [...falt] });
});
R('GET', '/api/adjuntos/:id', async (req, res, ctx) => {
  const a = db.prepare('SELECT * FROM adjuntos WHERE id=?').get(ctx.p.id); if (!a) throw new HttpErr(404, 'No existe'); cargar(a.solicitud_id, ctx.u);
  const f = path.join(DATA, 'uploads', a.archivo); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${encodeURIComponent(a.nombre)}"`, 'X-Content-Type-Options': 'nosniff' }); fs.createReadStream(f).pipe(res);
});

R('GET', '/api/revisiones', async (req, res, ctx) => {
  const areas = ['legal', 'ti', 'compras'].filter(a => has(ctx.u, a)); if (!areas.length) throw forb();
  const rows = db.prepare("SELECT r.*, s.folio, s.proveedor_nombre, s.monto FROM revisiones r JOIN solicitudes s ON s.id=r.solicitud_id WHERE r.estado='Pendiente' ORDER BY r.id").all().filter(r => areas.includes(r.area)).map(r => ({ ...r, disparadores: P(r.disparadores) }));
  send(res, 200, rows);
});
R('GET', '/api/proveedores', async (req, res, ctx) => { if (!has(ctx.u, 'compras')) throw forb(); send(res, 200, db.prepare('SELECT * FROM proveedores ORDER BY nombre').all().map(p => ({ ...p, documentos: P(p.documentos) }))); });
R('PUT', '/api/proveedores/:id', async (req, res, ctx) => { if (!has(ctx.u, 'compras')) throw forb(); const b = ctx.body; db.prepare('UPDATE proveedores SET nombre=?,rfc=?,contacto=?,correo=?,estatus=?,documentos=? WHERE id=?').run(b.nombre, b.rfc || '', b.contacto || '', b.correo || '', b.estatus || 'En alta', J(b.documentos || []), ctx.p.id); log(ctx.u.email, 'proveedor_editado', 'proveedores', b.nombre); send(res, 200, { ok: true }); });
R('POST', '/api/proveedores', async (req, res, ctx) => { if (!has(ctx.u, 'compras')) throw forb(); const b = ctx.body; if (!b.nombre) throw bad('Falta el nombre'); db.prepare('INSERT INTO proveedores(nombre,rfc,contacto,correo,estatus,documentos) VALUES(?,?,?,?,?,?)').run(b.nombre, b.rfc || '', b.contacto || '', b.correo || '', b.estatus || 'En alta', J(b.documentos || [])); log(ctx.u.email, 'proveedor_alta', 'proveedores', b.nombre); send(res, 200, { ok: true }); });

// dashboard
R('GET', '/api/dashboard', async (req, res, ctx) => {
  if (!has(ctx.u, 'compras', 'legal', 'direccion_obra')) throw forb();
  const q = ctx.q; const params = getParams();
  let rows = db.prepare("SELECT * FROM solicitudes WHERE enviada IS NOT NULL").all();
  if (q.desde) rows = rows.filter(r => r.enviada >= q.desde); if (q.hasta) rows = rows.filter(r => r.enviada <= q.hasta + 'T23:59:59'); if (q.obra) rows = rows.filter(r => String(r.obra_id) === q.obra);
  if (q.tipo) rows = rows.filter(r => r.tipo === q.tipo); if (q.nivel) rows = rows.filter(r => r.nivel_final === q.nivel); if (q.estado) rows = rows.filter(r => r.estado === q.estado); if (q.proveedor) rows = rows.filter(r => r.proveedor_key.includes(norm(q.proveedor)));
  const agg = (kf, vf = r => r.monto) => { const o = {}; for (const r of rows) { const k = kf(r) || 'N/D'; o[k] = o[k] || { n: 0, monto: 0 }; o[k].n++; o[k].monto += vf(r); } return o; };
  const res_ = r => P(r.resultado) || {};
  const mensual = {}; for (const r of rows) { const m = r.enviada.slice(0, 7); mensual[m] = mensual[m] || { N1: 0, N2: 0, N3: 0 }; if (r.nivel_final) mensual[m][r.nivel_final]++; }
  const trig = {}; for (const r of rows) for (const t of (res_(r).disparadoresSi || [])) trig[t] = (trig[t] || 0) + 1;
  const dias = (a, b) => (a && b) ? (new Date(b) - new Date(a)) / 864e5 : null; const prom = a => { a = a.filter(x => x != null); return a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null; };
  const tiempos = { instrumento: prom(rows.map(r => dias(r.enviada, (P(r.hitos) || {}).confirmado))), autorizacion: prom(rows.map(r => dias(r.enviada, (P(r.hitos) || {}).autorizada))), orden_compra: prom(rows.map(r => dias(r.enviada, (P(r.hitos) || {}).orden_compra))), cierre: prom(rows.map(r => dias(r.enviada, (P(r.hitos) || {}).cerrada))) };
  const evitados = rows.filter(r => r.nivel_final === 'N1' && r.monto_evaluado > params.topeVigente && r.estado !== 'Cancelada' && r.estado !== 'Rechazada');
  const porProv = agg(r => r.proveedor_nombre); const cerca = Object.entries(porProv).filter(([k]) => true).map(([k, v]) => ({ proveedor: k, ...v })).sort((a, b) => b.monto - a.monto).slice(0, 10);
  const fragment = []; const gr = {}; for (const r of rows) { if (['Cancelada', 'Rechazada'].includes(r.estado)) continue; const k = r.obra_id + '|' + r.proveedor_key; (gr[k] = gr[k] || []).push(r); } for (const l of Object.values(gr)) { const s = l.reduce((a, r) => a + r.monto, 0); if (l.length > 1 && s > params.topeAmpliado) fragment.push({ proveedor: l[0].proveedor_nombre, solicitudes: l.map(x => x.folio), total: s }); }
  const ajustes = db.prepare("SELECT ts,usuario,detalle,entidad FROM bitacora WHERE accion='ajuste_instrumento' ORDER BY id DESC LIMIT 50").all();
  const vivos = rows.filter(r => !['Cancelada', 'Rechazada'].includes(r.estado));
  const recientes = [...rows].sort((a, b) => b.id - a.id).slice(0, 8).map(r => ({ id: r.id, folio: r.folio, descripcion: (P(r.datos) || {}).descripcion || '', proveedor: r.proveedor_nombre, monto: r.monto, nivel: r.nivel_final, clasificacion: res_(r).clasificacion, estado: r.estado, fecha: r.enviada }));
  send(res, 200, { recientes, comprometido: vivos.reduce((a, r) => a + r.monto, 0), activas: vivos.length, naturalezaVivas: agg(r => r.naturaleza), total: rows.length, montoTotal: rows.reduce((a, r) => a + r.monto, 0), naturaleza: agg(r => r.naturaleza), instrumento: agg(r => r.nivel_final), tipo: agg(r => r.tipo), obra: agg(r => String(r.obra_id)), clasificacion: agg(r => res_(r).clasificacion), mensual, disparadores: trig, tiempos, contratosEvitados: { n: evitados.length, monto: evitados.reduce((a, r) => a + r.monto, 0), folios: evitados.map(r => r.folio) }, proveedores: cerca, fragmentacion: fragment,
    bloqueadas: rows.filter(r => r.estado.startsWith('Bloqueada')).map(r => ({ folio: r.folio, id: r.id, proveedor: r.proveedor_nombre, desde: r.actualizada, areas: db.prepare("SELECT area FROM revisiones WHERE solicitud_id=? AND estado='Pendiente'").all(r.id).map(x => x.area) })), ajustes });
});
R('GET', '/api/export/solicitudes.csv', async (req, res, ctx) => {
  if (!has(ctx.u, 'compras', 'legal', 'direccion_obra')) throw forb();
  const rows = db.prepare("SELECT s.folio,o.nombre obra,s.estado,s.tipo,s.naturaleza,s.proveedor_nombre,s.monto,s.monto_evaluado,s.nivel_motor,s.nivel_final,s.enviada FROM solicitudes s JOIN obras o ON o.id=s.obra_id WHERE s.enviada IS NOT NULL").all();
  const esc = v => { v = v == null ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const head = Object.keys(rows[0] || { folio: 1 }); const csv = '﻿' + [head.join(','), ...rows.map(r => head.map(h => esc(r[h])).join(','))].join('\n');
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="solicitudes.csv"' }); res.end(csv);
});

// administración
R('PUT', '/api/params', async (req, res, ctx) => {
  const u = ctx.u; const nuevo = ctx.body; const act = getParams();
  if (!has(u, 'admin')) throw forb();
  const tn = (v) => v === '' || v == null ? null : Number(v);
  if (!(nuevo.topeVigente > 0) || !(nuevo.topeAmpliado >= nuevo.topeVigente)) throw bad('El tope ampliado debe ser mayor o igual al vigente');
  const p = { ...act, ...nuevo, topeAbsolutoGiros: tn(nuevo.topeAbsolutoGiros) }; setParams(p, u.email);
  const diff = {}; for (const k of Object.keys(nuevo)) if (J(nuevo[k]) !== J(act[k])) diff[k] = { antes: act[k], despues: nuevo[k] }; log(u.email, 'params', 'parametros', diff); send(res, 200, { ok: true });
});
R('GET', '/api/usuarios', async (req, res, ctx) => { if (!has(ctx.u, 'admin')) throw forb(); send(res, 200, db.prepare('SELECT id,email,nombre,roles,activo FROM usuarios').all().map(x => ({ ...x, roles: P(x.roles) }))); });
R('POST', '/api/usuarios', async (req, res, ctx) => { if (!has(ctx.u, 'admin')) throw forb(); const b = ctx.body; const e = String(b.email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw bad('Correo invalido'); const dom = getParams().dominioCorreo; if (dom && !e.endsWith('@' + dom.toLowerCase())) throw bad('El correo debe ser @' + dom); if (!b.password || b.password.length < 10) throw bad('Contrasena inicial de minimo 10 caracteres'); const roles = (b.roles || []).filter(r => ROLES.includes(r)); if (!roles.length) throw bad('Asigna al menos un rol'); try { db.prepare('INSERT INTO usuarios(email,nombre,roles,pass) VALUES(?,?,?,?)').run(e, b.nombre || e, J(roles), hashPass(b.password)); } catch { throw bad('Ese correo ya existe'); } log(ctx.u.email, 'usuario_alta', 'usuarios', { e, roles }); send(res, 200, { ok: true }); });
R('PUT', '/api/usuarios/:id', async (req, res, ctx) => { if (!has(ctx.u, 'admin')) throw forb(); const b = ctx.body; const roles = (b.roles || []).filter(r => ROLES.includes(r)); db.prepare('UPDATE usuarios SET nombre=?, roles=?, activo=? WHERE id=?').run(b.nombre, J(roles), b.activo ? 1 : 0, ctx.p.id); if (b.password) { if (b.password.length < 10) throw bad('Minimo 10 caracteres'); db.prepare('UPDATE usuarios SET pass=?, intentos=0, bloqueado_hasta=0 WHERE id=?').run(hashPass(b.password), ctx.p.id); } log(ctx.u.email, 'usuario_editado', 'usuarios', { id: ctx.p.id, roles, activo: b.activo }); send(res, 200, { ok: true }); });
R('POST', '/api/obras', async (req, res, ctx) => { if (!has(ctx.u, 'admin')) throw forb(); const b = ctx.body; const pre = String(b.prefijo || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!b.nombre || !pre) throw bad('Nombre y prefijo son obligatorios'); try { db.prepare('INSERT INTO obras(nombre,prefijo) VALUES(?,?)').run(b.nombre, pre); } catch { throw bad('Ese prefijo ya existe'); } log(ctx.u.email, 'obra_alta', 'obras', b.nombre); send(res, 200, { ok: true }); });
R('PUT', '/api/obras/:id', async (req, res, ctx) => { if (!has(ctx.u, 'admin')) throw forb(); const b = ctx.body; db.prepare('UPDATE obras SET nombre=?, activa=? WHERE id=?').run(b.nombre, b.activa ? 1 : 0, ctx.p.id); log(ctx.u.email, 'obra_editada', 'obras', b.nombre); send(res, 200, { ok: true }); });
R('GET', '/api/obras-todas', async (req, res, ctx) => { if (!has(ctx.u, 'admin')) throw forb(); send(res, 200, db.prepare('SELECT * FROM obras').all()); });
R('GET', '/api/bitacora', async (req, res, ctx) => { if (!has(ctx.u, 'admin', 'legal')) throw forb(); send(res, 200, db.prepare('SELECT * FROM bitacora ORDER BY id DESC LIMIT 500').all()); });
R('GET', '/api/correos', async (req, res, ctx) => { if (!has(ctx.u, 'admin')) throw forb(); send(res, 200, db.prepare('SELECT id,para,asunto,enviado,error,ts FROM correos ORDER BY id DESC LIMIT 100').all()); });
R('POST', '/api/borrar-demo', async (req, res, ctx) => { if (!has(ctx.u, 'admin')) throw forb(); db.prepare('DELETE FROM usuarios WHERE demo=1').run(); db.prepare('DELETE FROM proveedores WHERE demo=1').run(); log(ctx.u.email, 'borrar_demo', 'sistema', ''); send(res, 200, { ok: true }); });

// ---------- servidor ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'");
    if (p.startsWith('/api/')) {
      const r = routes.find(x => x.m === req.method && x.re.test(p)); if (!r) throw new HttpErr(404, 'Ruta no encontrada');
      const ctx = { p: r.re.exec(p).groups || {}, q: Object.fromEntries(url.searchParams), u: null, body: {} };
      if (r.auth) { ctx.u = userFrom(req); if (!ctx.u) throw new HttpErr(401, 'Sesión expirada'); }
      if (!['GET', 'HEAD'].includes(req.method)) { if (!(req.headers['content-type'] || '').includes('application/json')) throw bad('Contenido no permitido'); ctx.body = await body(req); }
      return await r.fn(req, res, ctx);
    }
    let f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p)); if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(res);
  } catch (e) {
    if (!(e instanceof HttpErr)) console.error(e);
    if (!res.headersSent) send(res, e.code || 500, { error: e instanceof HttpErr ? e.message : 'Error interno del servidor' });
  }
});
if (require.main === module) server.listen(PORT, () => console.log(`Herramienta de compras ITM en ${BASE_URL}`));
module.exports = { server };
