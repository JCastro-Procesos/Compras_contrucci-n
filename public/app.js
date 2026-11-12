'use strict';
// Interfaz de la herramienta. Sin dependencias externas. Todo el texto visible esta en espanol.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'USD ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fdate = s => s ? new Date(s).toLocaleDateString('es-MX', { timeZone: 'America/Cancun', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fdt = s => s ? new Date(s).toLocaleString('es-MX', { timeZone: 'America/Cancun', dateStyle: 'short', timeStyle: 'short' }) : '';
const NIV = { N1: ['OS · Orden de Servicio', 'b1'], N2: ['Contrato simplificado', 'b2'], N3: ['Contrato formal', 'b3'] };
const NIVN = { N1: 'Orden de Servicio (OS)', N2: 'Contrato simplificado', N3: 'Contrato formal' };
const ROLN = { solicitante: 'Solicitante', compras: 'Compras', legal: 'Legal', ti: 'TI y Seguridad', direccion_obra: 'Dirección de Obra', admin: 'Administrador' };
const badgeN = n => n ? `<span class="badge ${NIV[n][1]}">${NIV[n][0]}</span>` : '<span class="badge bg">Pendiente</span>';
const badgeR = c => c ? `<span class="badge ${{ BAJO: 'b1', MEDIO: 'b2', ALTO: 'b3' }[c]}">${c}</span>` : '';
const badgeE = e => `<span class="badge ${/Bloqueada/.test(e) ? 'bg' : /Rechazada|Cancelada/.test(e) ? 'b3' : /Autorizada|Cerrada/.test(e) ? 'b1' : 'bb'}">${/Bloqueada/.test(e) ? '<span class="lock"></span>' : ''}${esc(e)}</span>`;
let S = { u: null, params: null, obras: [], provs: [] };

function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = err ? 'err' : ''; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', err ? 6000 : 3500); }
async function api(m, p, b) {
  const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  if (r.status === 401 && p !== '/api/login') { S.u = null; render(); throw new Error('Sesión expirada'); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error'); return j;
}
const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); } };
const has = (...r) => S.u && (S.u.roles.includes('admin') || r.some(x => S.u.roles.includes(x)));

// ---------- arranque y layout ----------
async function boot() { try { const m = await api('GET', '/api/me'); S = { ...S, u: m.usuario, params: m.params, obras: m.obras, provs: m.proveedores }; } catch { S.u = null; } render(); }
function render() { S.u ? layout() : loginView(); }
function loginView() {
  $('#app').innerHTML = `<form class="login" id="lf"><img src="/assets/logo-itm-group.png" alt="ITM Group"><h1 style="text-align:center">Instrumento de compra</h1><p class="sub" style="text-align:center">Área de construcción</p>
  <label for="em">Correo corporativo</label><input id="em" type="email" autocomplete="username" required><label for="pw">Contraseña</label><input id="pw" type="password" autocomplete="current-password" required>
  <p id="le" class="hint" style="color:var(--bad);min-height:20px"></p><button style="width:100%">Entrar</button></form>`;
  $('#lf').onsubmit = async e => { e.preventDefault(); try { await api('POST', '/api/login', { email: $('#em').value, password: $('#pw').value }); await boot(); } catch (x) { $('#le').textContent = x.message; } };
}
function menu() {
  const m = [['#/', 'Mis solicitudes']]; if (has('solicitante', 'compras')) m.push(['#/nueva', 'Nueva solicitud']);
  if (has('compras', 'legal', 'ti', 'direccion_obra')) m[0][1] = 'Solicitudes';
  if (has('legal', 'ti')) m.push(['#/revisiones', 'Revisiones pendientes']);
  if (has('compras')) m.push(['#/proveedores', 'Proveedores']);
  if (has('compras', 'legal', 'direccion_obra')) m.push(['#/dashboard', 'Dashboard']);
  if (has('admin')) m.push(['#/admin', 'Administración']); if (has('legal', 'admin')) m.push(['#/bitacora', 'Bitácora']);
  m.push(['#/clave', 'Mi contraseña']); return m;
}
function layout() {
  const h = location.hash || '#/';
  $('#app').innerHTML = `<header class="top"><img src="/assets/logo-itm-group.png" alt="ITM Group"><div class="sp"></div><form id="bf"><input id="bq" placeholder="Buscar folio…" aria-label="Buscar folio"></form><span class="hint">${esc(S.u.nombre)} · ${esc(S.u.roles.map(r => ROLN[r]).join(', '))}</span><button class="sec" id="out">Salir</button></header>
  <nav class="side" aria-label="Principal">${menu().map(([k, t]) => `<a href="${k}" class="${h === k || (k !== '#/' && h.startsWith(k)) ? 'on' : ''}">${t}</a>`).join('')}</nav><main class="main" id="view"></main>`;
  $('#out').onclick = async () => { await api('POST', '/api/logout'); S.u = null; render(); };
  $('#bf').onsubmit = async e => { e.preventDefault(); const q = $('#bq').value.trim().toLowerCase(); const l = await api('GET', '/api/solicitudes'); const f = l.find(x => (x.folio || '').toLowerCase() === q); if (f) location.hash = '#/s/' + f.id; else toast('No se encontró ese folio', true); };
  route();
}
window.addEventListener('hashchange', () => S.u && layout());
async function route() {
  const h = location.hash || '#/'; const v = $('#view'); try {
    if (h === '#/') return await listView(v);
    if (h === '#/nueva') return wizardStart(v);
    if (h.startsWith('#/s/')) return await detailView(v, h.split('/')[2], h.split('/')[3] || 'resumen');
    if (h === '#/revisiones') return await revisionesView(v);
    if (h === '#/proveedores') return await provView(v);
    if (h === '#/dashboard') return await dashView(v);
    if (h.startsWith('#/admin')) return await adminView(v, h.split('/')[2] || 'params');
    if (h === '#/bitacora') return await bitacoraView(v);
    if (h === '#/clave') return claveView(v);
    v.innerHTML = '<p>Página no encontrada.</p>';
  } catch (e) { v.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }
}

// ---------- lista ----------
async function listView(v) {
  const rows = await api('GET', '/api/solicitudes'); let f = { q: '', estado: '', nivel: '' };
  const draw = () => {
    const r = rows.filter(x => (!f.q || (x.folio + x.proveedor + x.solicitante).toLowerCase().includes(f.q.toLowerCase())) && (!f.estado || x.estado === f.estado) && (!f.nivel || x.nivel === f.nivel));
    $('#lt').innerHTML = r.length ? `<table><tr><th>Folio</th><th>Fecha</th><th>Obra</th><th>Tipo</th><th>Proveedor</th><th>Monto</th><th>Instrumento</th><th>Estado</th></tr>${r.map(x => `<tr class="link" data-id="${x.id}"><td><b>${esc(x.folio || 'Borrador')}</b></td><td>${fdate(x.enviada || x.creada)}</td><td>${esc(x.obra)}</td><td>${esc((S.params.tipos.find(t => t.id === x.tipo) || {}).nombre)}</td><td>${esc(x.proveedor)}</td><td>${money(x.monto)}</td><td>${badgeN(x.nivel)}</td><td>${badgeE(x.estado)}</td></tr>`).join('')}</table>` : '<p class="hint">Aún no hay solicitudes. Usa «Nueva solicitud» para registrar la primera.</p>';
    document.querySelectorAll('#lt tr.link').forEach(tr => tr.onclick = () => location.hash = '#/s/' + tr.dataset.id);
  };
  const estados = [...new Set(rows.map(r => r.estado))];
  v.innerHTML = `<h1>${has('compras', 'legal', 'ti', 'direccion_obra') ? 'Solicitudes' : 'Mis solicitudes'}</h1><p class="sub">Folio, instrumento y estado de cada compra.</p>${has('solicitante', 'compras') ? '<div class="toolbar"><a class="btn" href="#/nueva">+ Nueva solicitud</a></div>' : ''}
  <div class="card"><div class="filters"><input id="fq" placeholder="Buscar folio, proveedor…" aria-label="Buscar"><select id="fe"><option value="">Todos los estados</option>${estados.map(e => `<option>${esc(e)}</option>`).join('')}</select><select id="fn"><option value="">Todos los instrumentos</option><option value="N1">OS</option><option value="N2">Contrato simplificado</option><option value="N3">Contrato formal</option></select></div><div id="lt"></div></div>`;
  $('#fq').oninput = e => { f.q = e.target.value; draw(); }; $('#fe').onchange = e => { f.estado = e.target.value; draw(); }; $('#fn').onchange = e => { f.nivel = e.target.value; draw(); }; draw();
}

// ---------- cuestionario de nueva solicitud (una sola pagina) ----------
let W = null;
const GATE_IDS = { G1: ['T1', 'T2'], G2: ['T3'], G3: ['J2'], G4: ['J1'], G5: ['J3'], G6: ['E2'], G7: ['E3'] };
const ID2GATE = {}; for (const [g, ids] of Object.entries(GATE_IDS)) for (const i of ids) ID2GATE[i] = g;
function wizardStart(v) { if (!W || W.done) W = { d: { obraId: S.obras[0] && S.obras[0].id, gates: {}, scores: {}, evidencias: {}, exclusiones: {} } }; wizard(v || $('#view')); }
function tipoSel() { return S.params.tipos.find(t => t.id === W.d.tipoCompra); }
function seg(name, val, opts) { return `<span class="seg">${opts.map(([k, t]) => `<label class="${val === k ? 'sel' : ''}"><input type="radio" name="${name}" value="${k}" ${val === k ? 'checked' : ''} data-seg="${name}">${t}</label>`).join('')}</span>`; }
const SN = [['si', 'Sí'], ['no', 'No'], ['nose', 'No sé']];
const SIMPLE = () => !has('compras', 'legal', 'admin');
function aplicarPerfil() { const d = W.d, t = tipoSel(); if (!t || !t.perfil) return; for (const i of ['O1', 'O2', 'O3']) { d.scores[i] = t.perfil[i]; d.evidencias[i] = 'Respuesta del solicitante: ' + S.params.preguntas[i][2][t.perfil[i]]; } }
const NAT = ['X3', 'X4', 'X5'];
function natQ(d, P) {
  const act = P.exclusiones.filter(x => x.activa && NAT.includes(x.id)); if (!act.length) return '';
  const vals = act.map(x => d.exclusiones[x.id]);
  const cur = vals.some(v => v === 'nose') ? 'nose' : (act.find(x => d.exclusiones[x.id] === 'si') || {}).id || (vals.every(v => v === 'no') ? 'ninguna' : '');
  const L = 'ABCDEF', ops = [['ninguna', 'Ninguna de las siguientes: suministro de material o equipo usado'], ...act.map(x => [x.id, x.texto]), ['nose', 'No sé']];
  return `<div class="q"><div class="t">¿Qué es lo que se va a contratar? Elige una opción</div>${ops.map(([k, t], i) => `<label class="opt ${cur === k ? 'sel' : ''}"><input type="radio" name="nat" value="${k}" data-nat="1" ${cur === k ? 'checked' : ''}><span><b>${L[i]}.</b> ${esc(t)}</span></label>`).join('')}</div>`;
}
function wizard(v) {
  const y = window.scrollY, d = W.d, P = S.params, t = tipoSel();
  const preg = id => { const [dim, txt, anc] = P.preguntas[id]; const val = d.scores[id]; return `<div class="q" style="background:#fff"><div class="t">${esc(txt.startsWith('¿') ? txt : '¿' + txt)}</div>${anc.map((a, i) => i < 1 ? '' : `<label class="opt ${val == i ? 'sel' : ''}"><input type="radio" name="s_${id}" value="${i}" data-score="${id}" ${val == i ? 'checked' : ''}><span>${esc(a)}</span></label>`).join('')}<label>Explica brevemente</label><textarea data-ev="${id}" placeholder="Qué, cuánto, cuándo…">${esc(d.evidencias[id] || '')}</textarea></div>`; };
  const gate = ([g, txt]) => `<div class="q"><div class="t">${esc(txt)}</div>${seg('g_' + g, d.gates[g], SN)}${d.gates[g] === 'nose' ? '<p class="hint" style="color:var(--bad)">Aclara esta respuesta con quien conozca el detalle antes de enviar.</p>' : ''}${d.gates[g] === 'si' ? '<p class="hint" style="margin:10px 0 0">Elige la opción que más se parezca:</p>' + GATE_IDS[g].map(preg).join('') : ''}</div>`;
  const crit = id => { const anc = P.preguntas[id][2]; return `<div class="q"><div class="t">${esc(P.preguntas[id][1].replace(/^(.)/, c => '¿' + c))}</div><select data-crit="${id}"><option value="">Selecciona…</option>${anc.map((a, i) => `<option value="${i}" ${d.scores[id] === i ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>`; };
  v.innerHTML = `<h1>Nueva solicitud de compra</h1><p class="sub">Responde este cuestionario y el sistema te dice si la compra necesita contrato. No hay pasos: todo está en esta página.</p>
  <div class="card"><h2>1. ¿Qué vas a comprar?</h2><div class="grid g2"><div><label for="obra">Obra / UDN</label><select id="obra" data-k="obraId">${S.obras.map(o => `<option value="${o.id}" ${d.obraId == o.id ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></div>
  <div><label for="tc">Tipo de compra</label><select id="tc" data-k="tipoCompra"><option value="">Selecciona…</option>${P.tipos.map(x => `<option value="${x.id}" ${d.tipoCompra === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div></div>
  <label for="ds">Descripción y alcance</label><textarea id="ds" data-k="descripcion" placeholder="Qué se necesita, para qué parte de la obra…">${esc(d.descripcion || '')}</textarea>
  <div class="grid g3"><div><label for="ca">Cantidad</label><input id="ca" data-k="cantidad" value="${esc(d.cantidad || '')}"></div><div><label for="un">Unidad</label><input id="un" data-k="unidad" value="${esc(d.unidad || '')}" placeholder="ton, pza, m3…"></div><div><label for="mo">Monto total estimado (USD, toda la vigencia)</label><input id="mo" type="number" min="0" step="0.01" data-k="monto" value="${esc(d.monto || '')}"></div></div>
  <div class="grid g3"><div><label for="vi">Inicio</label><input id="vi" type="date" data-k="vigenciaInicio" value="${esc(d.vigenciaInicio || '')}"></div><div><label for="vf">Fin</label><input id="vf" type="date" data-k="vigenciaFin" value="${esc(d.vigenciaFin || '')}"></div><div><label for="fr">Fecha en que lo necesitas</label><input id="fr" type="date" data-k="fechaRequerida" value="${esc(d.fechaRequerida || '')}"></div></div>
  <div class="grid g2"><div><label for="pv">Proveedor</label><select id="pv" data-k="proveedorId"><option value="">— Proveedor nuevo —</option>${S.provs.map(p => `<option value="${p.id}" ${d.proveedorId == p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div><div><label for="pp">Partida presupuestal (opcional)</label><input id="pp" data-k="partida" value="${esc(d.partida || '')}"></div></div>
  ${d.proveedorId ? '' : `<div class="grid g2"><div><label for="pn">Nombre del proveedor nuevo</label><input id="pn" data-pn="nombre" value="${esc((d.proveedorNuevo || {}).nombre || '')}"></div><div><label for="pr">RFC / ID fiscal</label><input id="pr" data-pn="rfc" value="${esc((d.proveedorNuevo || {}).rfc || '')}"></div></div>`}
  <div class="grid g3"><div><label for="le">Lugar de entrega o ejecución (opcional)</label><input id="le" data-k="lugarEntrega" value="${esc(d.lugarEntrega || '')}"></div><div><label for="fp2">Forma de pago propuesta (opcional)</label><input id="fp2" data-k="formaPago" value="${esc(d.formaPago || '')}" placeholder="Contra entrega, 30 días…"></div><div><label for="ga">Garantía ofrecida (opcional)</label><input id="ga" data-k="garantia" value="${esc(d.garantia || '')}"></div></div>
  <label for="cot">Cotización (obligatoria · PDF, JPG, PNG, XLSX o DOCX, máx. 10 MB)</label><input id="cot" type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx">${d.cotizacion || d.cotizacionAdjunta ? `<p class="hint">Adjunto: ${esc((d.cotizacion || {}).nombre || d.cotizacionAdjunta)}</p>` : ''}</div>
  ${t ? `<div class="card"><h2>2. Sobre esta compra</h2><p class="hint">Responde cada pregunta. Ya marcamos lo que corresponde al tipo de compra elegido.</p>${P.exclusiones.filter(x => x.activa && !NAT.includes(x.id)).map(x => `<div class="q"><div class="t">¿${esc(x.texto)}?</div>${seg('x_' + x.id, d.exclusiones[x.id], SN)}</div>`).join('')}${natQ(d, P)}</div>
  <div class="card"><h2>3. Preguntas sobre la compra</h2><p class="hint">Si respondes «Sí», te pedimos elegir la opción que más se parezca y explicarlo brevemente.</p>${Object.entries(P.gates).map(gate).join('')}</div>
  <div class="card"><h2>4. Importancia de la compra para la obra</h2><p class="hint">${t.perfil ? 'Ya marcamos lo habitual para este tipo de compra. Cámbialo si no aplica.' : 'Elige la opción que más se parezca.'}</p>${['O1', 'O2', 'O3'].map(crit).join('')}</div>` : '<div class="alert info">Elige el tipo de compra para ver las preguntas.</div>'}
  <div style="height:120px"></div><div class="stick" id="rbar"></div>`;
  window.scrollTo(0, y); wizardBind(v); paintRes();
}
function amigable(f) {
  const id = f.slice(0, 2); if (/^X|Filtros/.test(f)) return 'Responde los filtros de «Sobre esta compra»';
  if (/^G\d/.test(f)) return 'Responde: ' + S.params.gates[f.slice(0, 2)];
  if (/^O\d/.test(f)) return 'Indica la importancia de la compra (sección 4)';
  if (ID2GATE[id]) return 'Completa el detalle de: ' + S.params.gates[ID2GATE[id]];
  return f;
}
function paintRes(err) {
  const el = $('#rbar'); if (!el) return; const d = W.d; const r = W.res; const base = x => `<div class="rb">${x}</div>`;
  let main = '', cls = 'rp';
  if (err) main = `<b>${esc(err)}</b>`; else if (!r) main = 'Responde el cuestionario para ver el resultado.';
  else if (r.estado === 'PENDIENTE') { const faltan = [...new Set(r.faltantes.map(amigable))]; main = `<b>Faltan respuestas</b> (${faltan.length}): <span class="hint">${esc(faltan[0])}${faltan.length > 1 ? ' y ' + (faltan.length - 1) + ' más' : ''}</span>`; }
  else { cls = { N1: 'r1', N2: 'r2', N3: 'r3' }[r.nivelFinal]; const msg = { N1: '✔ No requiere contrato. Se atiende con una Orden de Servicio.', N2: 'Requiere un Contrato simplificado. Compras y Legal lo preparan con tu información.', N3: 'Requiere un Contrato formal. Legal intervendrá.' }[r.nivelFinal];
    main = `<b>${msg}</b>${r.bloqueada ? ' <span class="hint">Además, un área especializada revisará esta compra antes de continuar.</span>' : ''}${!SIMPLE() ? `<div class="hint">${esc(r.reglaDeterminante)} · Puntaje ${r.total}/12 · ${r.clasificacion}</div>` : ''}`; }
  el.className = 'stick ' + cls;
  el.innerHTML = `<div style="flex:1">${main}</div><button class="sec" id="draft">Guardar borrador</button><button id="send" class="green" ${r && r.estado !== 'PENDIENTE' && !err ? '' : 'disabled'}>Enviar a Compras</button>`;
  $('#draft').onclick = () => act(async () => { const x = await api('POST', '/api/solicitudes', { datos: W.d }); W.d.id = x.id; if (W.d.cotizacion) { W.d.cotizacionAdjunta = W.d.cotizacion.nombre; delete W.d.cotizacion; } }, 'Borrador guardado');
  $('#send').onclick = async () => { const b = $('#send'); b.disabled = true; const x = await act(() => api('POST', '/api/solicitudes', { datos: W.d, enviar: true })); if (x) { W.done = true; toast('Solicitud ' + x.folio + ' enviada a Compras'); location.hash = '#/s/' + x.id; } else b.disabled = false; };
}
function refreshRes() { clearTimeout(refreshRes.t); refreshRes.t = setTimeout(async () => { try { const x = await api('POST', '/api/evaluar', W.d); W.res = x.resultado; paintRes(); } catch (e) { W.res = null; paintRes(/Selecciona/.test(e.message) ? 'Elige obra y tipo de compra para evaluar.' : e.message); } }, 250); }
function wizardBind(v) {
  const d = W.d; refreshRes();
  v.querySelectorAll('[data-k]').forEach(el => el.onchange = el.oninput = () => { const k = el.dataset.k; d[k] = el.value; if (k === 'tipoCompra') { const t = tipoSel(); d.exclusiones = {}; d.scores = {}; d.evidencias = {}; if (t) { for (const [x, val] of Object.entries(t.x || {})) d.exclusiones[x] = val; if (NAT.some(i => d.exclusiones[i] === 'si') || t.giroElegible) for (const i of NAT) if (!d.exclusiones[i]) d.exclusiones[i] = 'no'; aplicarPerfil(); } wizard(v); } else if (k === 'proveedorId') { if (d.proveedorId) delete d.proveedorNuevo; wizard(v); } else refreshRes(); });
  v.querySelectorAll('[data-pn]').forEach(el => el.oninput = () => { d.proveedorNuevo = { ...(d.proveedorNuevo || {}), [el.dataset.pn]: el.value }; refreshRes(); });
  v.querySelectorAll('[data-ev]').forEach(el => el.oninput = () => { d.evidencias[el.dataset.ev] = el.value; refreshRes(); });
  v.querySelectorAll('[data-score]').forEach(el => el.onchange = () => { d.scores[el.dataset.score] = Number(el.value); wizard(v); });
  v.querySelectorAll('[data-crit]').forEach(el => el.onchange = () => { const id = el.dataset.crit; if (el.value === '') { delete d.scores[id]; delete d.evidencias[id]; } else { d.scores[id] = Number(el.value); d.evidencias[id] = 'Respuesta del solicitante: ' + S.params.preguntas[id][2][d.scores[id]]; } refreshRes(); });
  v.querySelectorAll('[data-nat]').forEach(el => el.onchange = () => { const k = el.value; for (const id of NAT) d.exclusiones[id] = k === 'nose' ? 'nose' : (k === id ? 'si' : 'no'); wizard(v); });
  v.querySelectorAll('[data-seg]').forEach(el => el.onchange = () => { const [t, id] = el.dataset.seg.split('_'); if (t === 'x') d.exclusiones[id] = el.value; if (t === 'g') { d.gates[id] = el.value; if (el.value !== 'si') for (const i of GATE_IDS[id]) { delete d.scores[i]; delete d.evidencias[i]; } } wizard(v); });
  const cot = v.querySelector('#cot'); if (cot) cot.onchange = () => { const f = cot.files[0]; if (!f) return; if (f.size > 10 * 1048576) { toast('El archivo excede 10 MB', true); cot.value = ''; return; } const r = new FileReader(); r.onload = () => { d.cotizacion = { nombre: f.name, base64: String(r.result).split(',')[1] }; toast('Cotización adjunta'); wizard(v); }; r.readAsDataURL(f); };
}

// ---------- detalle ----------
const ETAPAS = ['Enviada', 'Análisis de Compras', 'Revisión especializada', 'Autorización', 'En compra', 'Cerrada'];
function etapaActual(s, hayRev) { const e = s.estado; return e === 'Bloqueada por revisión especializada' ? 2 : e === 'Pendiente de autorización' ? 3 : e === 'Autorizada' || e === 'En ejecución' ? 4 : e === 'Cerrada' ? 5 : 1; }
function mensajeEstado(s, D) {
  const pend = D.revisiones.filter(x => x.estado === 'Pendiente').map(x => ROLN[x.area] || x.area).join(' y ');
  const ult = D.autorizaciones[D.autorizaciones.length - 1];
  return ({ 'Borrador': 'Es un borrador. Termínalo y envíalo a Compras.', 'En análisis de Compras': 'Compras está revisando tu solicitud y confirmando el instrumento. No necesitas hacer nada.', 'Bloqueada por revisión especializada': `Un área especializada (${pend || 'Legal o TI'}) está revisando esta compra. Compras continuará en cuanto termine. No necesitas hacer nada.`, 'En formalización': 'Compras está preparando el documento y validando el presupuesto.', 'Pendiente de autorización': 'Está esperando la autorización de Dirección de Obra.', 'Autorizada': 'Autorizada. Compras generará la requisición y la orden de compra.', 'En ejecución': 'La compra está en proceso (orden de compra y pago). Cuando llegue lo solicitado, confirma la recepción en «Seguimiento de compra».', 'Cerrada': 'Compra concluida.', 'Rechazada': 'La solicitud fue rechazada.' + (ult ? ' Motivo: ' + ult.comentario : ''), 'Cancelada': 'La solicitud fue cancelada.' })[s.estado] || '';
}
function siguienteAccion(s, D, r) {
  const pend = D.revisiones.filter(x => x.estado === 'Pendiente');
  if (s.estado === 'Borrador') return 'Termina y envía el borrador.';
  if (['Cancelada', 'Rechazada', 'Cerrada'].includes(s.estado)) return '';
  if (pend.length) return 'Esperar a que ' + pend.map(x => ROLN[x.area] || x.area).join(' y ') + ' atiendan su revisión. No generes requisición ni orden de compra todavía.';
  if (!s.instrumento_confirmado) return 'Revisar la cotización y el proveedor, validar el presupuesto y confirmar el instrumento.';
  if (S.params.presupuestoCompras && !s.presupuesto_ok) return 'Validar el presupuesto.';
  if (s.estado === 'En formalización') return s.nivel_final === 'N1' ? 'Emitir la Orden de Servicio y enviar a autorización.' : s.nivel_final === 'N2' ? 'Generar el contrato simplificado (pestaña «Contrato»), revisarlo con Legal y enviar a autorización.' : 'Pedir a Legal el contrato formal y enviar a autorización.';
  if (s.estado === 'Pendiente de autorización') return 'Esperar la decisión de Dirección de Obra.';
  if (s.estado === 'Autorizada') return 'Registrar requisición, orden de compra y pago.';
  return 'Registrar los pasos de compra y esperar la recepción.';
}
async function detailView(v, id, tab) {
  const D = await api('GET', '/api/solicitudes/' + id); const s = D.solicitud, r = s.resultado || {}, P = S.params;
  const tipo = P.tipos.find(t => t.id === s.tipo) || {}; const pend = D.revisiones.filter(x => x.estado === 'Pendiente');
  const tecnico = has('compras', 'legal', 'ti', 'direccion_obra'); const operador = has('compras', 'legal');
  const contratoOk = operador && s.nivel_final === 'N2' && s.folio;
  const tabs = [['resumen', 'Resumen']]; if (tecnico) tabs.push(['evaluacion', 'Evaluación'], ['revisiones', 'Revisiones (' + D.revisiones.length + ')']); if (contratoOk) tabs.push(['contrato', 'Contrato']); tabs.push(['docs', 'Documentos']); if (tecnico) tabs.push(['historial', 'Historial']); tabs.push(['seguimiento', 'Seguimiento de compra']);
  if (!tabs.some(t => t[0] === tab)) tab = 'resumen';
  const autRol = P.autorizacion[s.nivel_final] || 'direccion_obra'; const esSol = s.solicitante_id === S.u.id;
  const botones = [];
  if (s.estado === 'Borrador') botones.push('<a class="btn" href="#/nueva" id="editb">Editar borrador</a>');
  const activa = !['Cancelada', 'Rechazada', 'Cerrada', 'Borrador'].includes(s.estado);
  if (operador && activa) { if (!s.instrumento_confirmado) botones.push('<button data-a="confirmar_instrumento">Confirmar instrumento</button>'); botones.push('<button class="sec" data-a="ajustar">Ajustar instrumento…</button>', '<button class="sec" data-a="disparadores">Ajustar disparadores…</button>', '<button class="sec" data-a="reevaluar">Reevaluar</button>'); }
  if (has('compras') && !s.presupuesto_ok && activa) botones.push('<button data-a="validar_presupuesto">Validar presupuesto</button>');
  if (has('compras') && s.instrumento_confirmado && s.estado === 'En formalización') botones.push('<button class="green" data-a="enviar_autorizacion">Enviar a autorización</button>');
  if (has('compras', 'solicitante', 'legal') && P.revisionLegal[s.nivel_final] === 'opcional' && !D.revisiones.some(x => x.area === 'legal') && activa) botones.push('<button class="sec" data-a="solicitar_legal">Solicitar revisión de Legal</button>');
  if (has(autRol) && s.estado === 'Pendiente de autorización') botones.push('<button class="green" data-a="autorizar">Autorizar / rechazar…</button>');
  if ((esSol || has('compras')) && activa) botones.push('<button class="sec" data-a="cancelar">Cancelar solicitud</button>');
  const seg = s.seguimiento || {}; const et = etapaActual(s); const conRev = D.revisiones.length > 0;
  const etapas = ETAPAS.map((n, i) => [n, i]).filter(([n, i]) => i !== 2 || conRev);
  const stepper = !['Cancelada', 'Rechazada', 'Borrador'].includes(s.estado) ? `<div class="stepper">${etapas.map(([n, i]) => `<div class="${i < et || s.estado === 'Cerrada' ? 'done' : i === et ? 'now' : ''}">${n}</div>`).join('')}</div>` : '';
  const sit = `<div class="card"><h2>¿En qué va esta solicitud?</h2>${stepper}<p style="font-size:16px;margin:6px 0">${esc(mensajeEstado(s, D))}</p></div>`;
  const prov = S.provs.find(p => p.id === s.proveedor_id);
  const check = operador && activa ? `<div class="card"><h2>Actividades a revisar</h2><p class="hint">Resumen para Compras antes de confirmar el instrumento.</p><ul class="chk">
    <li><span class="m ${s.instrumento_confirmado ? 'ok' : ''}">${s.instrumento_confirmado ? '✓' : '1'}</span><div><b>Instrumento sugerido: ${esc(r.instrumento || 'Pendiente')}${s.ajuste ? ' (ajustado)' : ''}</b><div class="hint">${esc(r.reglaDeterminante || '')}</div></div></li>
    <li><span class="m ${prov && prov.estatus === 'Activo' ? 'ok' : 'wait'}">${prov && prov.estatus === 'Activo' ? '✓' : '2'}</span><div><b>Proveedor: ${esc(s.proveedor_nombre)}</b><div class="hint">${prov && prov.estatus === 'Activo' ? 'Activo en el catálogo.' : 'Verifica que exista y esté activo; si es nuevo, dalo de alta en «Proveedores».'}</div></div></li>
    <li><span class="m">3</span><div><b>Cotización y alcance</b><div class="hint">Revisa la cotización adjunta contra la descripción: ${esc(String(s.datos.descripcion || '').slice(0, 140))}</div></div></li>
    <li><span class="m ${s.presupuesto_ok ? 'ok' : 'wait'}">${s.presupuesto_ok ? '✓' : '4'}</span><div><b>Presupuesto</b><div class="hint">${s.presupuesto_ok ? 'Validado por Compras.' : 'Confirma que hay partida y presupuesto disponible (botón «Validar presupuesto»).'}</div></div></li>
    <li><span class="m ${pend.length ? 'wait' : 'ok'}">${pend.length ? '5' : '✓'}</span><div><b>Revisiones especializadas</b><div class="hint">${pend.length ? 'Pendientes: ' + pend.map(x => (ROLN[x.area] || x.area) + ' (disparadores ' + (x.disparadores.join(', ') || '—') + ')').join('; ') + '. Mientras estén pendientes no se puede continuar.' : (D.revisiones.length ? 'Todas atendidas.' : 'No hay disparadores que revisar.')}</div></div></li>
    ${(r.alertas || []).length ? `<li><span class="m wait">!</span><div><b>Alertas</b><div class="hint">${r.alertas.map(esc).join('<br>')}</div></div></li>` : ''}
    <li><span class="m">6</span><div><b>Documento a preparar</b><div class="hint">${s.nivel_final === 'N1' ? 'Orden de Servicio (no requiere contrato).' : s.nivel_final === 'N2' ? 'Contrato simplificado: el sistema lo genera con los datos de la solicitud en la pestaña «Contrato».' : 'Contrato formal: solicitarlo a Legal.'}</div></div></li></ul>
    <div class="alert info"><b>Siguiente paso:</b> ${esc(siguienteAccion(s, D, r))}</div></div>` : '';
  const resumenSimple = `<div class="result ${{ N1: 'r1', N2: 'r2', N3: 'r3' }[s.nivel_final] || 'rp'}"><div class="big">${{ N1: 'No requiere contrato: Orden de Servicio', N2: 'Requiere Contrato simplificado', N3: 'Requiere Contrato formal' }[s.nivel_final] || 'En evaluación'}</div></div>`;
  const resumenTec = `<div class="result ${{ N1: 'r1', N2: 'r2', N3: 'r3' }[s.nivel_final] || 'rp'}"><div class="hint">Instrumento</div><div class="big">${esc(NIVN[s.nivel_final] || 'Pendiente')}${s.ajuste ? ' (ajustado)' : ''}</div><p>${esc(r.recomendacion || '')}</p><p class="hint">${esc(r.reglaDeterminante || '')}</p>${s.ajuste ? `<p class="hint">Ajuste manual de ${NIV[s.ajuste.de][0]} a ${NIV[s.ajuste.nivel][0]} por ${esc(s.ajuste.por)}: ${esc(s.ajuste.justificacion)}</p>` : ''}</div>`;
  v.innerHTML = `<h1>${esc(s.folio || 'Borrador')} ${badgeE(s.estado)} ${badgeN(s.nivel_final)}</h1><p class="sub">${esc(s.obra)} · ${esc(s.solicitante)} · ${esc(tipo.nombre)} (${tipo.naturaleza}) · ${esc(s.proveedor_nombre)} · ${money(s.monto)}</p>
  ${s.estado.startsWith('Bloqueada') && tecnico ? `<div class="alert"><span class="lock"></span><b>NO HABILITAR:</b> cerrar revisión especializada. Pendiente: ${pend.map(p => ROLN[p.area] || p.area).join(', ')}.</div>` : ''}
  <div class="toolbar">${botones.join('')}<button class="sec" id="prt">Imprimir / PDF</button></div><div id="ap"></div>${sit}${check}
  <div class="tabs">${tabs.map(([k, t]) => `<a href="#/s/${id}/${k}" class="${tab === k ? 'on' : ''}">${t}</a>`).join('')}</div>
  <div class="tabpane" style="display:${tab === 'resumen' ? 'block' : 'none'}"><div class="card">${tecnico ? resumenTec : resumenSimple}
    <h3>Datos</h3><table><tr><td>Descripción</td><td>${esc(s.datos.descripcion)}</td></tr><tr><td>Cantidad</td><td>${esc(s.datos.cantidad || '')} ${esc(s.datos.unidad || '')}</td></tr><tr><td>Monto</td><td>${money(s.monto)}${tecnico ? ` · evaluado ${money(s.monto_evaluado)} (acumulado ${money(s.monto_evaluado - s.monto)})` : ''}</td></tr><tr><td>Vigencia</td><td>${fdate(s.datos.vigenciaInicio)} – ${fdate(s.datos.vigenciaFin)}</td></tr><tr><td>Partida</td><td>${esc(s.datos.partida || '')}</td></tr>${tecnico ? `<tr><td>Presupuesto validado (Compras)</td><td>${s.presupuesto_ok ? 'Sí' : 'No'}</td></tr><tr><td>Instrumento confirmado por Compras</td><td>${s.instrumento_confirmado ? 'Sí' : 'No'}</td></tr>` : ''}</table>
    ${tecnico ? (r.alertas || []).map(a => `<div class="alert">${esc(a)}</div>`).join('') + (r.avisos || []).map(a => `<div class="alert info">${esc(a)}</div>`).join('') : ''}
    ${D.autorizaciones.length ? '<h3>Autorización</h3>' + D.autorizaciones.map(a => `<p><b>${esc(a.decision)}</b> · ${esc(a.nombre)} ${esc(a.puesto)} · ${fdt(a.ts)}<br>${esc(a.comentario)}</p>`).join('') : ''}</div></div>
  ${tecnico ? `<div class="tabpane" style="display:${tab === 'evaluacion' ? 'block' : 'none'}"><div class="card"><h2>Evaluación (versión ${D.evaluaciones[0] ? D.evaluaciones[0].version : '-'})</h2>${r.scores ? `<table><tr><th>Pregunta</th><th>Puntos</th><th>Evidencia</th></tr>${['E1', 'E2', 'E3', 'O1', 'O2', 'O3', 'J1', 'J2', 'J3', 'T1', 'T2', 'T3'].map(i => `<tr><td><b>${i}</b> ${esc(P.preguntas[i][1])}</td><td>${r.scores[i]}</td><td>${esc((r.evidencias || {})[i] || '')}</td></tr>`).join('')}</table><p>Puntaje ${r.total}/12 ${badgeR(r.clasificacion)} · ${esc(r.recomendacion)}</p>` : ''}<h3>Disparadores</h3><p class="hint">Se proponen automáticamente a partir de las respuestas. Compras o Legal pueden corregirlos con justificación.</p><ul>${P.disparadores.map(t => `<li>${t.id} · ${esc(t.nombre)}: <b>${(r.disparadoresSi || []).includes(t.id) ? 'Sí' : 'No'}</b>${(s.datos.disparadoresManual || {})[t.id] ? ' (ajustado manualmente)' : ''}</li>`).join('')}</ul><h3>Versiones</h3><ul>${D.evaluaciones.map(e => `<li>v${e.version} · ${fdt(e.ts)} · ${esc(e.usuario)} · ${esc((e.resultado || {}).instrumento || '')} (parámetros v${e.params_version})</li>`).join('')}</ul>${has('compras') ? '<button class="sec" data-a="e1">Ajustar E1 manualmente…</button>' : ''}</div></div>
  <div class="tabpane" style="display:${tab === 'revisiones' ? 'block' : 'none'}"><div class="card">${D.revisiones.length ? D.revisiones.map(x => `<div class="q"><div class="t">${ROLN[x.area] || x.area} · ${x.estado === 'Atendida' ? '<span class="badge b1">Atendida</span>' : '<span class="badge bg"><span class="lock"></span>Pendiente</span>'}</div><div class="hint">Disparadores: ${x.disparadores.join(', ') || '—'} · Evidencia mínima: ${esc(x.evidencia_pedida)}</div>${x.estado === 'Atendida' ? `<p>${esc(x.texto)}<br><span class="hint">${esc(x.usuario)} · ${fdt(x.cerrada)}</span></p>` : (has(x.area) ? `<button data-a="atender" data-rev="${x.id}">Marcar como atendida…</button>` : '')}</div>`).join('') : '<p class="hint">Sin revisiones especializadas.</p>'}</div></div>` : ''}
  ${contratoOk ? `<div class="tabpane" style="display:${tab === 'contrato' ? 'block' : 'none'}"><div class="card"><h2>Contrato simplificado (borrador)</h2><div id="ctr"><p class="hint">Generando…</p></div></div></div>` : ''}
  <div class="tabpane" style="display:${tab === 'docs' ? 'block' : 'none'}"><div class="card">${D.adjuntos.length ? '<ul>' + D.adjuntos.map(a => `<li><a href="/api/adjuntos/${a.id}">${esc(a.nombre)}</a> <span class="hint">${esc(a.tipo)} · ${fdt(a.ts)}</span></li>`).join('') + '</ul>' : '<p class="hint">Sin documentos.</p>'}</div></div>
  ${tecnico ? `<div class="tabpane" style="display:${tab === 'historial' ? 'block' : 'none'}"><div class="card"><ul class="tl">${D.bitacora.map(b => `<li><b>${fdt(b.ts)}</b> · ${esc(b.usuario)} · ${esc(b.accion)} ${esc(b.detalle && b.detalle !== '{}' ? b.detalle : '')}</li>`).join('')}</ul></div></div>` : ''}
  <div class="tabpane" style="display:${tab === 'seguimiento' ? 'block' : 'none'}"><div class="card"><table><tr><th>Paso</th><th>Estado</th><th></th></tr>${[['requisicion', 'Requisición'], ['orden_compra', 'Orden de compra'], ['pago', 'Pago'], ['recepcion', 'Recepción del producto o servicio']].map(([k, t]) => `<tr><td>${t}</td><td>${seg[k] ? `Registrado ${fdt(seg[k].fecha)} ${esc(seg[k].ref || seg[k].nota || '')}` : 'Pendiente'}</td><td>${!seg[k] && ['Autorizada', 'En ejecución'].includes(s.estado) && ((k !== 'recepcion' && has('compras')) || (k === 'recepcion' && (esSol || has('compras')))) ? `<button data-a="${k}">Registrar</button>` : ''}</td></tr>`).join('')}</table>${!['Autorizada', 'En ejecución', 'Cerrada'].includes(s.estado) ? '<p class="hint">Se habilita cuando la solicitud esté autorizada y sin revisiones pendientes.</p>' : ''}</div></div>`;
  $('#prt').onclick = () => print();
  const call = (body, ok) => act(async () => { await api('POST', `/api/solicitudes/${id}/accion`, body); await detailView(v, id, tab); }, ok);
  const modal = (titulo, campos, enviar, ok) => { $('#ap').innerHTML = `<div class="card"><h2>${titulo}</h2>${campos}<div class="toolbar"><button id="mok">Aceptar</button><button class="sec" id="mno">Cancelar</button></div></div>`; $('#mno').onclick = () => $('#ap').innerHTML = ''; $('#mok').onclick = () => { const b = enviar(); if (b) call(b, ok); }; $('#ap').scrollIntoView(); };
  v.querySelectorAll('[data-a]').forEach(btn => btn.onclick = () => {
    const a = btn.dataset.a;
    if (a === 'ajustar') return modal('Ajustar instrumento', `<label>Nuevo nivel</label><select id="m1"><option value="N1">OS</option><option value="N2">Contrato simplificado</option><option value="N3">Contrato formal</option></select><label>Justificación (obligatoria)</label><textarea id="m2"></textarea><p class="hint">Compras solo puede subir el nivel; bajarlo lo hace Legal. El resultado original del motor se conserva.</p>`, () => ({ accion: 'ajustar_instrumento', nivel: $('#m1').value, justificacion: $('#m2').value }), 'Instrumento ajustado');
    if (a === 'disparadores') return modal('Ajustar disparadores', `<p class="hint">Se detectaron según las respuestas. Cambia solo los que no correspondan o falten.</p>${P.disparadores.map(t => { const m = (s.datos.disparadoresManual || {})[t.id]; const cur = m || ((r.disparadoresSi || []).includes(t.id) ? 'si' : 'no'); return `<label>${t.id} · ${esc(t.nombre)}</label><select data-dd="${t.id}"><option value="si" ${cur === 'si' ? 'selected' : ''}>Sí</option><option value="no" ${cur === 'no' ? 'selected' : ''}>No</option></select>`; }).join('')}<label>Justificación (obligatoria)</label><textarea id="m2"></textarea>`, () => { const valores = {}; document.querySelectorAll('[data-dd]').forEach(e => { const was = (r.disparadoresSi || []).includes(Number(e.dataset.dd)) ? 'si' : 'no'; if (e.value !== was) valores[e.dataset.dd] = e.value; }); if (!Object.keys(valores).length) { toast('No cambiaste ningún disparador', true); return null; } return { accion: 'ajustar_disparadores', valores, justificacion: $('#m2').value }; }, 'Disparadores ajustados');
    if (a === 'atender') return modal('Atender revisión', `<label>Controles aplicados y conclusión</label><textarea id="m1"></textarea><label>Adjunto (opcional)</label><input type="file" id="m2">`, () => { const body = { accion: 'atender_revision', revisionId: Number(btn.dataset.rev), texto: $('#m1').value }; const f = $('#m2').files[0]; if (!f) return body; const rd = new FileReader(); rd.onload = () => { body.adjunto = { nombre: f.name, base64: String(rd.result).split(',')[1] }; call(body, 'Revisión atendida'); }; rd.readAsDataURL(f); return null; }, 'Revisión atendida');
    if (a === 'autorizar') return modal('Decisión de autorización', `<label>Decisión</label><select id="m1"><option>Aprobada</option><option>Aprobada con condiciones</option><option>Rechazada</option></select><label>Puesto</label><input id="m3"><label>Comentario</label><textarea id="m2"></textarea>`, () => ({ accion: 'autorizar', decision: $('#m1').value, puesto: $('#m3').value, comentario: $('#m2').value }), 'Decisión registrada');
    if (a === 'cancelar') return modal('Cancelar solicitud', `<label>Motivo</label><textarea id="m1"></textarea>`, () => ({ accion: 'cancelar', justificacion: $('#m1').value }), 'Solicitud cancelada');
    if (a === 'e1') return modal('Ajustar E1', `<label>Nuevo valor de E1 (0 a 3)</label><input id="m1" type="number" min="0" max="3"><label>Justificación</label><textarea id="m2"></textarea>`, () => ({ accion: 'reevaluar', e1Manual: Number($('#m1').value), justificacion: $('#m2').value }), 'E1 ajustada');
    if (['requisicion', 'orden_compra', 'pago'].includes(a)) return modal('Registrar ' + btn.closest('tr').children[0].textContent, `<label>Referencia / número</label><input id="m1">`, () => ({ accion: a, referencia: $('#m1').value }), 'Registrado');
    if (a === 'recepcion') return modal('Confirmar recepción', `<label>Nota (opcional)</label><input id="m1">`, () => ({ accion: 'recepcion', nota: $('#m1').value }), 'Folio cerrado');
    call({ accion: a }, 'Listo');
  });
  const eb = $('#editb'); if (eb) eb.onclick = () => { W = { d: { ...s.datos, id: s.id, gates: s.datos.gates || {}, scores: s.datos.scores || {}, evidencias: s.datos.evidencias || {}, exclusiones: s.datos.exclusiones || {} } }; };
  if (contratoOk && tab === 'contrato') contratoView(id);
}
async function contratoView(id) {
  const el = $('#ctr'); try {
    const c = await api('GET', `/api/solicitudes/${id}/contrato`);
    const html = esc(c.texto).replace(/\[[A-ZÁÉÍÓÚÑ ]+\]/g, m => `<mark>${m}</mark>`);
    el.innerHTML = `<div class="alert">${esc(c.aviso)}</div>${c.pendientes.length ? `<p class="hint">Campos por completar: ${c.pendientes.map(esc).join(', ')}</p>` : ''}<div class="toolbar"><button id="cw">Descargar Word (.doc)</button><button class="sec" id="cp">Imprimir / PDF</button></div><div class="doc">${html}</div>`;
    $('#cp').onclick = () => print();
    $('#cw').onclick = () => { const body = esc(c.texto).split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''); const blob = new Blob(['﻿<html><head><meta charset="utf-8"></head><body style="font-family:Times New Roman;font-size:12pt"><p><b>BORRADOR PARA VALIDACIÓN DE LEGAL</b></p>' + body + '</body></html>'], { type: 'application/msword' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Contrato-simplificado-' + c.folio + '.doc'; a.click(); };
  } catch (e) { el.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }
}

// ---------- revisiones, proveedores ----------
async function revisionesView(v) {
  const rows = await api('GET', '/api/revisiones');
  v.innerHTML = `<h1>Revisiones pendientes</h1><p class="sub">Tareas asignadas a tu área. La solicitud sigue bloqueada hasta que las marques como atendidas.</p><div class="card">${rows.length ? `<table><tr><th>Folio</th><th>Área</th><th>Proveedor</th><th>Monto</th><th>Evidencia mínima</th></tr>${rows.map(r => `<tr class="link" data-id="${r.solicitud_id}"><td><b>${esc(r.folio)}</b></td><td>${ROLN[r.area] || r.area}</td><td>${esc(r.proveedor_nombre)}</td><td>${money(r.monto)}</td><td>${esc(r.evidencia_pedida)}</td></tr>`).join('')}</table>` : '<p class="hint">No tienes revisiones pendientes.</p>'}</div>`;
  v.querySelectorAll('tr.link').forEach(t => t.onclick = () => location.hash = '#/s/' + t.dataset.id + '/revisiones');
}
async function provView(v) {
  const rows = await api('GET', '/api/proveedores'); const docs = '';
  v.innerHTML = `<h1>Proveedores</h1><p class="sub">Alta básica y estatus. La evaluación de idoneidad del proveedor es una fase posterior.</p><div class="card"><table><tr><th>Nombre</th><th>RFC / ID</th><th>Contacto</th><th>Correo</th><th>Estatus</th><th>Documentos (lista editable)</th><th></th></tr>${rows.map(p => `<tr data-id="${p.id}"><td><input value="${esc(p.nombre)}" data-f="nombre"></td><td><input value="${esc(p.rfc)}" data-f="rfc"></td><td><input value="${esc(p.contacto)}" data-f="contacto"></td><td><input value="${esc(p.correo)}" data-f="correo"></td><td><select data-f="estatus">${['Activo', 'En alta', 'Bloqueado'].map(e => `<option ${p.estatus === e ? 'selected' : ''}>${e}</option>`).join('')}</select></td><td><input value="${esc((p.documentos || []).join(', '))}" data-f="documentos" placeholder="Acta, RFC, opinión de cumplimiento…"></td><td><button data-s>Guardar</button></td></tr>`).join('')}</table>
  <h3>Nuevo proveedor</h3><div class="grid g4"><input id="np1" placeholder="Razón social"><input id="np2" placeholder="RFC / ID fiscal"><input id="np3" placeholder="Correo"><button id="npb">Agregar</button></div></div>`;
  v.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const tr = b.closest('tr'); const g = f => tr.querySelector(`[data-f=${f}]`).value; act(() => api('PUT', '/api/proveedores/' + tr.dataset.id, { nombre: g('nombre'), rfc: g('rfc'), contacto: g('contacto'), correo: g('correo'), estatus: g('estatus'), documentos: g('documentos').split(',').map(x => x.trim()).filter(Boolean) }), 'Proveedor guardado'); });
  $('#npb').onclick = () => act(async () => { await api('POST', '/api/proveedores', { nombre: $('#np1').value, rfc: $('#np2').value, correo: $('#np3').value }); const m = await api('GET', '/api/me'); S.provs = m.proveedores; provView(v); }, 'Proveedor agregado');
}

// ---------- dashboard ----------
const ICO = { doc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>', cash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>', ok: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>' };
const usd = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pillN = n => n ? `<span class="pill ${{ N1: 'p1', N2: 'p2', N3: 'p3' }[n]}">${{ N1: 'Orden de Servicio', N2: 'Contrato simplificado', N3: 'Contrato formal' }[n]}</span>` : '';
const pillR = c => c ? `<span class="pill ${{ BAJO: 'p1', MEDIO: 'p2', ALTO: 'p3' }[c]}">${c}</span>` : '';
const pillE = e => `<span class="pill ${/Bloqueada/.test(e) ? 'pg' : /Rechazada|Cancelada/.test(e) ? 'p3' : /Autorizada|Cerrada/.test(e) ? 'p1' : 'pb'}">${/Bloqueada/.test(e) ? '🔒 ' : ''}${esc(e)}</span>`;
function donut(items) {
  const tot = items.reduce((a, x) => a + x.n, 0) || 1; let off = 0; const R = 70, C = 2 * Math.PI * R;
  const arcs = items.filter(x => x.n).map(x => { const len = C * x.n / tot; const a = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${x.c}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`; off += len; return a; }).join('');
  return `<svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Distribución por instrumento"><circle r="${R}" cx="90" cy="90" fill="none" stroke="#eaeef6" stroke-width="22"/>${arcs}<text x="90" y="92" text-anchor="middle" font-size="30" font-weight="800" fill="#23346F">${items.reduce((a, x) => a + x.n, 0)}</text><text x="90" y="112" text-anchor="middle" font-size="12" fill="#5A6272">solicitudes</text></svg>`;
}
async function dashView(v) {
  const q = new URLSearchParams(window.__dq || {}); const D = await api('GET', '/api/dashboard?' + q); const P = S.params;
  const bars = (o, nom) => { const e = Object.entries(o).sort((a, b) => b[1].monto - a[1].monto); const mx = Math.max(1, ...e.map(x => x[1].monto)); return e.length ? e.map(([k, x]) => `<div class="bar"><span class="n" title="${esc(nom(k))}">${esc(nom(k))}</span><span class="f" style="width:${Math.max(2, 60 * x.monto / mx)}%"></span><span class="v">${x.n} · ${money(x.monto)}</span></div>`).join('') : '<p class="hint">Sin datos</p>'; };
  const nomN = k => ({ N1: 'Orden de Servicio', N2: 'Contrato simplificado', N3: 'Contrato formal' }[k] || k);
  const nat = D.naturaleza; const cuan = nat.cuantitativa || { n: 0, monto: 0 }, cual = nat.cualitativa || { n: 0, monto: 0 }; const nTot = Math.max(1, cuan.n + cual.n);
  const ins = D.instrumento; const itm = [{ n: (ins.N1 || {}).n || 0, c: '#2E9E5B', t: 'Orden de Servicio' }, { n: (ins.N2 || {}).n || 0, c: '#D9970B', t: 'Contrato simplificado' }, { n: (ins.N3 || {}).n || 0, c: '#D64545', t: 'Contrato formal' }];
  const meses = Object.keys(D.mensual).sort();
  v.innerHTML = `<div class="grid g4" style="margin-bottom:16px">
   <div class="kcard"><div class="kt">Solicitudes registradas</div><span class="kic">${ICO.doc}</span><div class="kv">${D.total}</div><div class="ks">Con folio asignado</div></div>
   <div class="kcard"><div class="kt">Monto comprometido</div><span class="kic">${ICO.cash}</span><div class="kv">${usd(D.comprometido)}</div><div class="ks">USD · solicitudes activas</div></div>
   <div class="kcard"><div class="kt">Contratos evitados</div><span class="kic">${ICO.ok}</span><div class="kv">${D.contratosEvitados.n}</div><div class="ks">Órdenes de Servicio sobre el tope vigente (${money(P.topeVigente)})</div></div>
   <div class="kcard"><div class="kt">Revisión pendiente</div><span class="kic warn">${ICO.lock}</span><div class="kv">${D.bloqueadas.length}</div><div class="ks">Bloqueadas por revisión especializada</div></div></div>
  <div class="grid g2" style="grid-template-columns:1fr 1fr"><div class="card"><h2>Distribución por instrumento</h2><p class="hint">Instrumento vigente por solicitud</p><div class="donutw">${donut(itm)}<div class="leg" style="flex:1;min-width:220px">${itm.map(x => `<div><i style="background:${x.c}"></i>${x.t}<b>${x.n}</b></div>`).join('')}</div></div></div>
   <div class="card"><h2>Naturaleza de la compra</h2><p class="hint">Solicitudes y monto por tipo de adquisición</p>
    <div style="display:flex;justify-content:space-between;font-size:15px"><span>Cuantitativa <span class="hint">(bienes)</span></span><b>${cuan.n}</b></div><div class="prog"><i style="width:${100 * cuan.n / nTot}%;background:#0068D6"></i></div><div class="hint">${usd(cuan.monto)} USD</div>
    <div style="display:flex;justify-content:space-between;font-size:15px;margin-top:18px"><span>Cualitativa <span class="hint">(servicios)</span></span><b>${cual.n}</b></div><div class="prog"><i style="width:${100 * cual.n / nTot}%;background:#6f86c8"></i></div><div class="hint">${usd(cual.monto)} USD</div></div></div>
  <div class="card"><h2>Solicitudes recientes</h2><p class="hint">Abre un folio para consultar su evaluación y seguimiento.</p>${D.recientes.length ? `<table><tr><th>Folio</th><th>Descripción</th><th>Proveedor</th><th>Monto USD</th><th>Instrumento</th><th>Riesgo</th><th>Estado</th><th>Fecha</th></tr>${D.recientes.map(x => `<tr class="link" data-id="${x.id}"><td><a href="#/s/${x.id}"><b>${esc(x.folio)}</b></a></td><td>${esc(x.descripcion.slice(0, 48))}</td><td>${esc(x.proveedor)}</td><td><b>${usd(x.monto)}</b></td><td>${pillN(x.nivel)}</td><td>${pillR(x.clasificacion)}</td><td>${pillE(x.estado)}</td><td>${fdate(x.fecha)}</td></tr>`).join('')}</table>` : '<p class="hint">Aún no hay solicitudes enviadas.</p>'}</div>
  <details class="card"><summary style="cursor:pointer;font-weight:700;color:var(--navy)">Filtros y análisis detallado</summary>
  <div class="filters" style="margin-top:12px"><input type="date" id="fd" aria-label="Desde" value="${q.get('desde') || ''}"><input type="date" id="fh" aria-label="Hasta" value="${q.get('hasta') || ''}"><select id="fo"><option value="">Todas las obras</option>${S.obras.map(o => `<option value="${o.id}" ${q.get('obra') == o.id ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select><select id="ft"><option value="">Todos los tipos</option>${P.tipos.map(t => `<option value="${t.id}" ${q.get('tipo') === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select><select id="fi"><option value="">Todos los instrumentos</option><option value="N1">OS</option><option value="N2">Contrato simplificado</option><option value="N3">Contrato formal</option></select><input id="fp" placeholder="Proveedor" value="${esc(q.get('proveedor') || '')}"><button id="fa">Aplicar</button><a class="btn" href="/api/export/solicitudes.csv" style="background:#fff;color:var(--navy);border:1px solid var(--navy)">Exportar CSV</a></div>
  <div class="grid g2"><div class="card"><h2>Por tipo de compra</h2>${bars(D.tipo, k => (P.tipos.find(t => t.id === k) || {}).nombre || k)}</div><div class="card"><h2>Por obra</h2>${bars(D.obra, k => (S.obras.find(o => o.id == k) || {}).nombre || k)}</div></div>
  <div class="grid g2"><div class="card"><h2>Tendencia mensual por instrumento</h2>${meses.length ? `<table><tr><th>Mes</th><th>OS</th><th>Contrato simplificado</th><th>Contrato formal</th></tr>${meses.map(m => `<tr><td>${m}</td><td>${D.mensual[m].N1}</td><td>${D.mensual[m].N2}</td><td>${D.mensual[m].N3}</td></tr>`).join('')}</table>` : '<p class="hint">Sin datos</p>'}</div><div class="card"><h2>Riesgo y disparadores</h2>${bars(D.clasificacion, k => k)}<h3>Disparadores</h3>${Object.entries(D.disparadores).map(([k, n]) => `<div class="bar"><span class="n">${esc((P.disparadores.find(t => t.id == k) || {}).nombre)}</span><span class="f" style="width:${n * 20}px"></span><span class="v">${n}</span></div>`).join('') || '<p class="hint">Ninguno</p>'}</div></div>
  <div class="grid g2"><div class="card"><h2>Tiempo promedio desde el envío (días)</h2><table><tr><td>Hasta instrumento confirmado</td><td>${D.tiempos.instrumento ?? '—'}</td></tr><tr><td>Hasta autorización</td><td>${D.tiempos.autorizacion ?? '—'}</td></tr><tr><td>Hasta orden de compra</td><td>${D.tiempos.orden_compra ?? '—'}</td></tr><tr><td>Hasta cierre</td><td>${D.tiempos.cierre ?? '—'}</td></tr></table></div><div class="card"><h2>Monto por proveedor (top 10)</h2>${D.proveedores.map(p => `<div class="bar"><span class="n">${esc(p.proveedor)}</span><span class="f" style="width:${Math.max(2, 50 * p.monto / Math.max(1, D.proveedores[0].monto))}%;${p.monto >= P.topeAmpliado * P.alertaPct / 100 ? 'background:var(--warn)' : ''}"></span><span class="v">${money(p.monto)}</span></div>`).join('') || '<p class="hint">Sin datos</p>'}<p class="hint">En ámbar: cerca o por encima del tope ampliado.</p></div></div>
  <div class="card"><h2>Alertas</h2>${D.fragmentacion.length ? D.fragmentacion.map(f => `<div class="alert">Posible fragmentación con <b>${esc(f.proveedor)}</b>: ${f.solicitudes.join(', ')} suman ${money(f.total)}.</div>`).join('') : '<p class="hint">Sin alertas de fragmentación.</p>'}<h3>Bloqueadas</h3>${D.bloqueadas.map(b => `<p><a href="#/s/${b.id}/revisiones">${esc(b.folio)}</a> · ${esc(b.proveedor)} · desde ${fdate(b.desde)} · áreas: ${b.areas.map(a => ROLN[a] || a).join(', ')}</p>`).join('') || '<p class="hint">Ninguna.</p>'}<h3>Ajustes manuales</h3>${D.ajustes.map(a => `<p class="hint">${fdt(a.ts)} · ${esc(a.usuario)} · ${esc(a.entidad)} · ${esc(a.detalle)}</p>`).join('') || '<p class="hint">Ninguno.</p>'}</div></details>`;
  v.querySelectorAll('tr.link').forEach(t => t.onclick = () => location.hash = '#/s/' + t.dataset.id);
  if (q.toString()) v.querySelector('details').open = true;
  $('#fi').value = q.get('nivel') || '';
  $('#fa').onclick = () => { window.__dq = { desde: $('#fd').value, hasta: $('#fh').value, obra: $('#fo').value, tipo: $('#ft').value, nivel: $('#fi').value, proveedor: $('#fp').value }; for (const k in window.__dq) if (!window.__dq[k]) delete window.__dq[k]; dashView(v); };
}

// ---------- administracion ----------
async function adminView(v, tab) {
  const P = await api('GET', '/api/me').then(m => m.params); S.params = P;
  const tabs = [['params', 'Parámetros'], ['reglas', 'Tipos y reglas'], ['contrato', 'Plantilla de contrato'], ['usuarios', 'Usuarios'], ['obras', 'Obras'], ['correos', 'Correos']];
  let body = '';
  if (tab === 'params') {
    body = `<div class="card"><h2>Topes y reglas de la OS</h2><div class="grid g3"><div><label>Tope vigente de OS (USD)</label><input id="p1" type="number" value="${P.topeVigente}"></div><div><label>Tope ampliado de OS (USD)</label><input id="p2" type="number" value="${P.topeAmpliado}"></div><div><label>Tope máximo absoluto para giros elegibles (USD; vacío = sin tope)</label><input id="p3" type="number" value="${P.topeAbsolutoGiros ?? ''}"></div></div>
    <div class="grid g3"><div><label>Ventana de acumulado (meses)</label><input id="p4" type="number" value="${P.ventanaMeses}"></div><div><label>Alerta al % del tope ampliado</label><input id="p5" type="number" value="${P.alertaPct}"></div><div><label>Dominio de correo corporativo (ej. itmgroup.com)</label><input id="p6" value="${esc(P.dominioCorreo)}"></div></div>
    <label class="opt"><input type="checkbox" id="p7" ${P.avisoInformativo ? 'checked' : ''}> Mostrar aviso informativo cuando una puntuación sugiere un disparador no marcado</label><label class="opt"><input type="checkbox" id="p8" ${P.presupuestoCompras ? 'checked' : ''}> Compras debe validar el presupuesto antes de enviar a autorización</label>
    <h3>Bandas de E1 (monto evaluado → puntuación)</h3><p class="hint">Provisionales: las valida el administrador. Vacío en «Hasta» = sin límite.</p>${P.bandasE1.map((b, i) => `<div class="grid g3" style="margin:4px 0"><input data-b="h${i}" type="number" placeholder="Hasta (USD)" value="${b.hasta ?? ''}"><input data-b="v${i}" type="number" min="1" max="3" value="${b.valor}"><span class="hint">puntuación E1</span></div>`).join('')}
    <h3>Revisión de Legal por nivel</h3><div class="grid g3">${['N1', 'N2', 'N3'].map(n => `<div><label>${NIV[n][0]}</label><select data-rl="${n}">${[['siempre', 'Siempre'], ['excepcion', 'Por excepción'], ['opcional', 'Opcional'], ['ninguna', 'Ninguna']].map(([k, t]) => `<option value="${k}" ${P.revisionLegal[n] === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('')}</div>
    <h3>Rol que autoriza por nivel</h3><div class="grid g3">${['N1', 'N2', 'N3'].map(n => `<div><label>${NIV[n][0]}</label><select data-au="${n}">${['direccion_obra', 'compras', 'legal', 'admin'].map(k => `<option value="${k}" ${P.autorizacion[n] === k ? 'selected' : ''}>${ROLN[k]}</option>`).join('')}</select></div>`).join('')}</div>
    <div class="toolbar"><button id="psave">Guardar parámetros</button></div></div>`;
  } else if (tab === 'reglas') {
    body = `<div class="card"><h2>Exclusiones de Legal</h2><p class="hint">«Aplica bajo el tope vigente» = la exclusión también impide la OS por debajo de ${money(P.topeVigente)}. Propuesta inicial: mano de obra, fianzas y construcción sí aplican siempre; equipo nuevo y renta con operador solo limitan la ampliación.</p><table><tr><th>ID</th><th>Texto</th><th>Activa</th><th>Aplica bajo el tope vigente</th></tr>${P.exclusiones.map((x, i) => `<tr><td>${x.id}</td><td><input data-x="t${i}" value="${esc(x.texto)}"></td><td><input type="checkbox" data-x="a${i}" ${x.activa ? 'checked' : ''}></td><td><input type="checkbox" data-x="b${i}" ${x.aplicaBajoTope ? 'checked' : ''}></td></tr>`).join('')}</table>
    <h2 style="margin-top:20px">Tipos de compra</h2><table><tr><th>Nombre</th><th>Naturaleza</th><th>Giro elegible para OS</th><th>Perfil O1/O2/O3 sugerido</th><th>Filtros precargados</th></tr>${P.tipos.map((t, i) => `<tr><td><input data-t="n${i}" value="${esc(t.nombre)}"></td><td><select data-t="z${i}"><option ${t.naturaleza === 'cuantitativa' ? 'selected' : ''}>cuantitativa</option><option ${t.naturaleza === 'cualitativa' ? 'selected' : ''}>cualitativa</option></select></td><td><input type="checkbox" data-t="g${i}" ${t.giroElegible ? 'checked' : ''}></td><td><input data-t="p${i}" value="${t.perfil ? [t.perfil.O1, t.perfil.O2, t.perfil.O3].join('/') : ''}" placeholder="1/1/1 o vacío"></td><td class="hint">${Object.entries(t.x || {}).map(([k, v]) => k + '=' + v).join(', ') || '—'}</td></tr>`).join('')}</table><div class="toolbar"><button id="rsave">Guardar reglas</button></div></div>`;
  } else if (tab === 'contrato') {
    const T = P.plantillaContrato; const CU = [['siempre', 'Siempre'], ...Object.entries(P.gates).map(([g, t]) => [g, g + ' = Sí: ' + t.slice(0, 55) + '…'])];
    body = `<div class="card"><h2>Plantilla del contrato simplificado</h2><div class="alert">PROPUESTA PARA VALIDACIÓN DE LEGAL. El sistema llena los campos {{entre llaves}} con los datos de cada solicitud y agrega automáticamente las cláusulas que correspondan según las respuestas del cuestionario. Los datos que falten salen como [POR COMPLETAR].</div>
    <div class="grid g3"><div><label>Razón social de ITM</label><input id="t1" value="${esc(P.razonSocialITM)}"></div><div><label>Representante legal de ITM</label><input id="t2" value="${esc(P.representanteITM)}"></div><div><label>Ciudad de jurisdicción</label><input id="t3" value="${esc(P.ciudadJurisdiccion)}"></div></div>
    <label>Encabezado</label><textarea id="te" style="min-height:130px">${esc(T.encabezado)}</textarea><label>Declaraciones</label><textarea id="td" style="min-height:130px">${esc(T.declaraciones)}</textarea>
    <h3>Cláusulas</h3>${T.clausulas.map((c, i) => `<div class="q"><div class="grid g2"><div><label>Título</label><input data-c="t${i}" value="${esc(c.titulo)}"></div><div><label>Se incluye</label><select data-c="w${i}">${CU.map(([k, t]) => `<option value="${k}" ${c.cuando === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div></div><textarea data-c="x${i}" style="min-height:90px">${esc(c.texto)}</textarea></div>`).join('')}
    <label>Cierre y firmas</label><textarea id="tz" style="min-height:130px">${esc(T.cierre)}</textarea>
    <h3>Nombre del contrato según el tipo de compra</h3><div class="grid g2">${P.tipos.map(t => `<div><label>${esc(t.nombre)}</label><input data-tc="${t.id}" value="${esc(P.tiposContrato[t.id] || '')}"></div>`).join('')}</div>
    <p class="hint">Campos disponibles: {{folio}} {{tipo_contrato}} {{razon_social_itm}} {{representante_itm}} {{proveedor}} {{rfc_proveedor}} {{representante_proveedor}} {{obra}} {{descripcion}} {{cantidad}} {{unidad}} {{lugar_entrega}} {{monto}} {{monto_letra}} {{forma_pago}} {{vigencia_inicio}} {{vigencia_fin}} {{fecha_requerida}} {{garantia}} {{detalle_anticipos}} {{detalle_penalizaciones}} {{detalle_accesos}} {{detalle_condiciones_especiales}} {{ciudad_jurisdiccion}} {{fecha}}</p>
    <div class="toolbar"><button id="tsave">Guardar plantilla</button></div></div>`;
  } else if (tab === 'usuarios') {
    const us = await api('GET', '/api/usuarios');
    body = `<div class="card"><h2>Usuarios</h2><p class="hint">Entran con su correo corporativo y la contraseña que les asignes. Un usuario puede tener varios roles.</p><table><tr><th>Correo</th><th>Nombre</th><th>Roles</th><th>Activo</th><th>Nueva contraseña</th><th></th></tr>${us.map(u => `<tr data-id="${u.id}"><td>${esc(u.email)}</td><td><input data-f="n" value="${esc(u.nombre)}"></td><td>${Object.keys(ROLN).map(r => `<label style="display:inline-block;margin-right:8px;font-weight:400"><input type="checkbox" data-r="${r}" ${u.roles.includes(r) ? 'checked' : ''}> ${ROLN[r]}</label>`).join('')}</td><td><input type="checkbox" data-f="a" ${u.activo ? 'checked' : ''}></td><td><input type="password" data-f="p" placeholder="(sin cambio)"></td><td><button data-s>Guardar</button></td></tr>`).join('')}</table>
    <h3>Nuevo usuario</h3><div class="grid g4"><input id="u1" placeholder="correo@empresa.com"><input id="u2" placeholder="Nombre"><input id="u3" type="password" placeholder="Contraseña inicial (10+)"><select id="u4">${Object.keys(ROLN).map(r => `<option value="${r}">${ROLN[r]}</option>`).join('')}</select></div><div class="toolbar"><button id="ua">Agregar usuario</button><button class="sec" id="udemo">Borrar usuarios y proveedores de demostración</button></div></div>`;
  } else if (tab === 'obras') {
    const ob = await api('GET', '/api/obras-todas');
    body = `<div class="card"><h2>Obras / UDN</h2><p class="hint">El prefijo forma el folio (ej. OBR-2026-0001) y no se puede cambiar.</p><table><tr><th>Prefijo</th><th>Nombre</th><th>Activa</th><th></th></tr>${ob.map(o => `<tr data-id="${o.id}"><td><b>${esc(o.prefijo)}</b></td><td><input data-f="n" value="${esc(o.nombre)}"></td><td><input type="checkbox" data-f="a" ${o.activa ? 'checked' : ''}></td><td><button data-s>Guardar</button></td></tr>`).join('')}</table><h3>Nueva obra</h3><div class="grid g3"><input id="o1" placeholder="Prefijo (ej. CAN)"><input id="o2" placeholder="Nombre de la obra"><button id="oa">Agregar</button></div></div>`;
  } else {
    const c = await api('GET', '/api/correos');
    body = `<div class="card"><h2>Correos generados</h2><p class="hint">Si el SMTP no está configurado, aquí se ve lo que se enviaría.</p><table><tr><th>Fecha</th><th>Para</th><th>Asunto</th><th>Envío</th></tr>${c.map(x => `<tr><td>${fdt(x.ts)}</td><td>${esc(x.para)}</td><td>${esc(x.asunto)}</td><td>${x.enviado ? 'Enviado' : x.error ? 'Error: ' + esc(x.error) : 'Guardado (sin SMTP)'}</td></tr>`).join('')}</table></div>`;
  }
  v.innerHTML = `<h1>Administración</h1><div class="tabs">${tabs.map(([k, t]) => `<a href="#/admin/${k}" class="${tab === k ? 'on' : ''}">${t}</a>`).join('')}</div>${body}`;
  const numOrNull = x => x === '' ? null : Number(x);
  const ps = $('#psave'); if (ps) ps.onclick = () => act(async () => { const n = { topeVigente: Number($('#p1').value), topeAmpliado: Number($('#p2').value), topeAbsolutoGiros: $('#p3').value, ventanaMeses: Number($('#p4').value), alertaPct: Number($('#p5').value), dominioCorreo: $('#p6').value.trim(), avisoInformativo: $('#p7').checked, presupuestoCompras: $('#p8').checked, bandasE1: P.bandasE1.map((_, i) => ({ hasta: numOrNull(v.querySelector(`[data-b=h${i}]`).value), valor: Number(v.querySelector(`[data-b=v${i}]`).value) })), revisionLegal: {}, autorizacion: {} }; v.querySelectorAll('[data-rl]').forEach(e => n.revisionLegal[e.dataset.rl] = e.value); v.querySelectorAll('[data-au]').forEach(e => n.autorizacion[e.dataset.au] = e.value); await api('PUT', '/api/params', n); adminView(v, tab); }, 'Parámetros guardados (nueva versión)');
  const tsv = $('#tsave'); if (tsv) tsv.onclick = () => act(async () => { const cl = P.plantillaContrato.clausulas.map((c, i) => ({ ...c, titulo: v.querySelector(`[data-c=t${i}]`).value, cuando: v.querySelector(`[data-c=w${i}]`).value, texto: v.querySelector(`[data-c=x${i}]`).value })); const tc = {}; v.querySelectorAll('[data-tc]').forEach(e => tc[e.dataset.tc] = e.value); await api('PUT', '/api/params', { topeVigente: P.topeVigente, topeAmpliado: P.topeAmpliado, topeAbsolutoGiros: P.topeAbsolutoGiros, razonSocialITM: $('#t1').value, representanteITM: $('#t2').value, ciudadJurisdiccion: $('#t3').value, tiposContrato: tc, plantillaContrato: { encabezado: $('#te').value, declaraciones: $('#td').value, clausulas: cl, cierre: $('#tz').value } }); adminView(v, tab); }, 'Plantilla guardada');
  const rs = $('#rsave'); if (rs) rs.onclick = () => act(async () => { const ex = P.exclusiones.map((x, i) => ({ ...x, texto: v.querySelector(`[data-x=t${i}]`).value, activa: v.querySelector(`[data-x=a${i}]`).checked, aplicaBajoTope: v.querySelector(`[data-x=b${i}]`).checked })); const tp = P.tipos.map((t, i) => { const pv = v.querySelector(`[data-t=p${i}]`).value.trim(); const pp = pv ? pv.split('/').map(Number) : null; return { ...t, nombre: v.querySelector(`[data-t=n${i}]`).value, naturaleza: v.querySelector(`[data-t=z${i}]`).value, giroElegible: v.querySelector(`[data-t=g${i}]`).checked, perfil: pp && pp.length === 3 && pp.every(n => n >= 0 && n <= 3) ? { O1: pp[0], O2: pp[1], O3: pp[2] } : null }; }); await api('PUT', '/api/params', { topeVigente: P.topeVigente, topeAmpliado: P.topeAmpliado, exclusiones: ex, tipos: tp, topeAbsolutoGiros: P.topeAbsolutoGiros }); adminView(v, tab); }, 'Reglas guardadas');
  v.querySelectorAll('tr[data-id] [data-s]').forEach(b => b.onclick = () => { const tr = b.closest('tr'); const f = k => tr.querySelector(`[data-f=${k}]`); if (tab === 'usuarios') act(() => api('PUT', '/api/usuarios/' + tr.dataset.id, { nombre: f('n').value, activo: f('a').checked, password: f('p').value, roles: [...tr.querySelectorAll('[data-r]')].filter(x => x.checked).map(x => x.dataset.r) }), 'Usuario guardado'); else act(() => api('PUT', '/api/obras/' + tr.dataset.id, { nombre: f('n').value, activa: f('a').checked }), 'Obra guardada'); });
  const ua = $('#ua'); if (ua) ua.onclick = () => act(async () => { await api('POST', '/api/usuarios', { email: $('#u1').value, nombre: $('#u2').value, password: $('#u3').value, roles: [$('#u4').value] }); adminView(v, tab); }, 'Usuario creado');
  const ud = $('#udemo'); if (ud) ud.onclick = () => confirm('¿Borrar usuarios y proveedores de demostración?') && act(async () => { await api('POST', '/api/borrar-demo'); adminView(v, tab); }, 'Datos demo eliminados');
  const oa = $('#oa'); if (oa) oa.onclick = () => act(async () => { await api('POST', '/api/obras', { prefijo: $('#o1').value, nombre: $('#o2').value }); adminView(v, tab); }, 'Obra creada');
}
async function bitacoraView(v) {
  const b = await api('GET', '/api/bitacora');
  v.innerHTML = `<h1>Bitácora de auditoría</h1><p class="sub">Registro inmutable: no admite edición ni borrado (últimos 500).</p><div class="card"><table><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr>${b.map(x => `<tr><td>${fdt(x.ts)}</td><td>${esc(x.usuario)}</td><td>${esc(x.accion)}</td><td>${esc(x.entidad)}</td><td class="hint">${esc(x.detalle)}</td></tr>`).join('')}</table></div>`;
}
function claveView(v) {
  v.innerHTML = `<h1>Mi contraseña</h1><div class="card" style="max-width:420px"><label>Contraseña actual</label><input id="c1" type="password"><label>Nueva contraseña (mínimo 10 caracteres)</label><input id="c2" type="password"><div class="toolbar"><button id="cb">Cambiar</button></div></div>`;
  $('#cb').onclick = () => act(async () => { await api('POST', '/api/cambiar-clave', { actual: $('#c1').value, nueva: $('#c2').value }); $('#c1').value = $('#c2').value = ''; }, 'Contraseña actualizada');
}
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href="#/nueva"]'); if (a && a.id !== 'editb') W = null; });
boot();
