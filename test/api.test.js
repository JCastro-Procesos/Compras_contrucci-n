'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/itm-'); process.env.SEED_DEMO = '1';
const test = require('node:test'); const assert = require('node:assert');
const { server } = require('../server/index'); let base; let cookies = {};
test.before(() => new Promise(r => server.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; r(); })));
test.after(() => server.close());
async function api(who, m, p, b) { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', cookie: cookies[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; }
async function login(who) { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: who + '@itm.local', password: 'demo1234' }) }); cookies[who] = r.headers.get('set-cookie').split(';')[0]; }
const NO7 = { G1:'no',G2:'no',G3:'no',G4:'no',G5:'no',G6:'no',G7:'no' }, XNO = { X1:'no',X2:'no',X3:'no',X4:'no',X5:'no' };
const D = (o) => { return { obraId: 1, tipoCompra: 'material_obra', descripcion: 'Varilla 3/8', monto: 18000, proveedorId: 1, cotizacion: { nombre: 'cot.pdf', base64: Buffer.from('%PDF-1').toString('base64') }, gates: NO7, exclusiones: XNO, scores: { O1:1,O2:1,O3:1 }, evidencias: { O1:'a',O2:'b',O3:'c' }, ...o }; };

test('flujo completo: OS sin bloqueo hasta cierre', async () => {
  for (const w of ['solicitante','compras','legal','obra']) await login(w);
  assert.equal((await api('solicitante','GET','/api/dashboard')).s, 403);
  const pre = await api('solicitante','POST','/api/evaluar', D({}));
  assert.equal(pre.j.resultado.nivelFinal, 'N1');
  const r = await api('solicitante','POST','/api/solicitudes', { datos: D({}), enviar: true });
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.match(r.j.folio, /^OBR-\d{4}-0001$/); assert.equal(r.j.estado, 'En análisis de Compras');
  const id = r.j.id;
  assert.equal((await api('solicitante','POST',`/api/solicitudes/${id}/accion`, { accion:'ajustar_instrumento', nivel:'N3', justificacion:'x' })).s, 403);
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'ajustar_instrumento', nivel:'N2' })).s, 400);
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'confirmar_instrumento' })).s, 200);
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'enviar_autorizacion' })).s, 400); // falta presupuesto
  assert.equal((await api('legal','POST',`/api/solicitudes/${id}/accion`, { accion:'validar_presupuesto' })).s, 403);
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'validar_presupuesto' })).s, 200);
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'enviar_autorizacion' })).s, 200);
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'autorizar', decision:'Aprobada' })).s, 403);
  assert.equal((await api('obra','POST',`/api/solicitudes/${id}/accion`, { accion:'autorizar', decision:'Aprobada' })).s, 200);
  for (const a of ['requisicion','orden_compra','pago']) assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:a, referencia:'1' })).s, 200);
  assert.equal((await api('solicitante','POST',`/api/solicitudes/${id}/accion`, { accion:'recepcion' })).s, 200);
  const det = await api('compras','GET',`/api/solicitudes/${id}`); assert.equal(det.j.solicitud.estado, 'Cerrada');
  const dash = await api('compras','GET','/api/dashboard'); assert.equal(dash.j.contratosEvitados.n, 1);
});
test('caso C: anticipo (disparador 6 automatico) bloquea hasta que Legal atienda', async () => {
  const d = D({ monto: 9000, gates: { ...NO7, G6: 'si' }, scores: { O1:1,O2:1,O3:1,E2:3 }, evidencias: { O1:'a',O2:'b',O3:'c',E2:'anticipo 100%' } });
  const r = await api('solicitante','POST','/api/solicitudes', { datos: d, enviar: true });
  assert.equal(r.j.estado, 'Bloqueada por revisión especializada'); assert.equal(r.j.resultado.nivelFinal, 'N3'); const id = r.j.id;
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'orden_compra' })).s, 400);
  const det = (await api('compras','GET',`/api/solicitudes/${id}`)).j; const areas = det.revisiones.map(x => x.area).sort(); assert.deepEqual(areas, ['legal']);
  for (const rv of det.revisiones) assert.equal((await api(rv.area,'POST',`/api/solicitudes/${id}/accion`, { accion:'atender_revision', revisionId: rv.id, texto:'controles ok' })).s, 200);
  const fin = (await api('compras','GET',`/api/solicitudes/${id}`)).j; assert.equal(fin.solicitud.estado, 'En análisis de Compras'); assert.equal(fin.solicitud.resultado.bloqueada, false); assert.equal(fin.solicitud.nivel_final, 'N3');
});
test('permisos: solicitante no ve ajenas; bitacora inmutable', async () => {
  const { db } = require('../server/db'); assert.throws(() => db.prepare("UPDATE bitacora SET accion='x'").run()); assert.throws(() => db.prepare('DELETE FROM bitacora').run());
  const l = await api('solicitante','GET','/api/solicitudes'); assert.ok(l.j.length >= 2);
  await login('ti'); const t = await api('ti','GET','/api/solicitudes'); assert.ok(t.j.length >= 2); assert.equal((await api('solicitante','GET','/api/usuarios')).s, 403);
});
test('"No se" no permite enviar; archivos invalidos se rechazan', async () => {
  assert.equal((await api('solicitante','POST','/api/solicitudes', { datos: D({ gates: { ...NO7, G2: 'nose' } }), enviar: true })).s, 400);
  assert.equal((await api('solicitante','POST','/api/solicitudes', { datos: D({ cotizacion: { nombre: 'x.exe', base64: 'QQ==' } }), enviar: true })).s, 400);
});

test('disparadores automaticos, ajuste manual con justificacion y retiro de la revision', async () => {
  const r = await api('solicitante','POST','/api/solicitudes', { datos: D({ monto: 5000, tipoCompra:'servicio_prof', gates: { ...NO7, G1:'si' }, scores: { O1:1,O2:1,O3:1,T1:1,T2:3 }, evidencias: { O1:'a',O2:'b',O3:'c',T1:'x',T2:'datos personales' } }), enviar: true });
  assert.equal(r.j.estado, 'Bloqueada por revisión especializada'); const id = r.j.id;
  assert.equal((await api('solicitante','POST',`/api/solicitudes/${id}/accion`, { accion:'ajustar_disparadores', valores:{1:'no'}, justificacion:'x' })).s, 403);
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'ajustar_disparadores', valores:{1:'no'} })).s, 400);
  assert.equal((await api('compras','POST',`/api/solicitudes/${id}/accion`, { accion:'ajustar_disparadores', valores:{1:'no'}, justificacion:'El proveedor no recibe datos' })).s, 200);
  const det = (await api('compras','GET',`/api/solicitudes/${id}`)).j; const ti = det.revisiones.find(x => x.area === 'ti'); assert.equal(ti.estado, 'Atendida'); assert.match(ti.texto, /Disparador retirado/); assert.equal(det.revisiones.find(x => x.area === 'legal').estado, 'Pendiente'); // N3: Legal revisa siempre el instrumento
});
test('contrato simplificado se genera con los datos y solo para Compras/Legal', async () => {
  const r = await api('solicitante','POST','/api/solicitudes', { datos: D({ tipoCompra:'otro', monto: 12000, descripcion:'Servicio de topografia', exclusiones:{ ...XNO, X1:'si' }, formaPago:'30 dias', proveedorId: 2 }), enviar: true });
  assert.equal(r.j.resultado.nivelFinal, 'N2'); const id = r.j.id;
  assert.equal((await api('solicitante','GET',`/api/solicitudes/${id}/contrato`)).s, 403);
  const c = await api('compras','GET',`/api/solicitudes/${id}/contrato`); assert.equal(c.s, 200);
  assert.match(c.j.texto, /CONTRATO SIMPLIFICADO DE SUMINISTRO/); assert.match(c.j.texto, /Servicio de topografia/); assert.match(c.j.texto, /DOCE MIL DÓLARES/); assert.match(c.j.texto, /Maquinaria Usada Peninsular/); assert.match(c.j.texto, /PRIMERA\.- OBJETO/);
  assert.ok(c.j.pendientes.length > 0); assert.doesNotMatch(c.j.texto, /\{\{/);
});
test('Finanzas ya no participa: ninguna tarea se asigna a finanzas', async () => {
  const { db } = require('../server/db'); assert.equal(db.prepare("SELECT COUNT(*) n FROM revisiones WHERE area='finanzas'").get().n, 0);
});
