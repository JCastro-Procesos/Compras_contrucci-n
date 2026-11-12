'use strict';
// Motor de reglas: replica la matriz de riesgo de ITM (12 preguntas, 4 dimensiones)
// y le suma la regla de elegibilidad de Orden de Servicio definida por Legal.
// Es una funcion pura: no toca base de datos ni red. Se prueba en test/engine.test.js

const IDS = ['E1','E2','E3','O1','O2','O3','J1','J2','J3','T1','T2','T3'];
const GATES = { G1:['T1','T2'], G2:['T3'], G3:['J2'], G4:['J1'], G5:['J3'], G6:['E2'], G7:['E3'] };
const NIVEL = { N1:1, N2:2, N3:3 };
const NOMBRE_NIVEL = { N1:'Orden de Servicio (OS)', N2:'Contrato simplificado', N3:'Contrato formal' };

const DEFAULT_PARAMS = require('./defaults');

function bandaE1(monto, bandas) {
  if (!(monto > 0)) return 0;
  for (const b of bandas) if (b.hasta == null || monto <= b.hasta) return b.valor;
  return bandas[bandas.length-1].valor;
}

// Convierte las respuestas guiadas en las 12 puntuaciones (null = pendiente)
function construirPuntuaciones(entrada, params) {
  const s = {}; const evid = {}; const faltantes = [];
  const sc = entrada.scores || {}; const ev = entrada.evidencias || {};
  s.E1 = entrada.e1Manual != null ? Number(entrada.e1Manual) : bandaE1(entrada.montoEvaluado, params.bandasE1);
  evid.E1 = 'Calculada automáticamente por bandas según el monto evaluado';
  for (const id of ['O1','O2','O3']) {
    const v = sc[id];
    if (v === undefined || v === null || v === '') { s[id] = null; faltantes.push(id+': falta puntuación'); continue; }
    s[id] = Number(v);
    evid[id] = ev[id] || '';
    if (s[id] > 0 && !String(evid[id]).trim()) faltantes.push(id+': falta evidencia');
  }
  for (const [g, ids] of Object.entries(GATES)) {
    const r = (entrada.gates || {})[g];
    for (const id of ids) {
      if (r === 'no') { s[id] = 0; evid[id] = 'Declarado por el solicitante: no aplica'; }
      else if (r === 'si') {
        const v = sc[id];
        if (v === undefined || v === null || v === '' || Number(v) < 1) { s[id] = null; faltantes.push(id+': puntuar de 1 a 3'); }
        else { s[id] = Number(v); evid[id] = ev[id] || ''; if (!String(evid[id]).trim()) faltantes.push(id+': falta evidencia'); }
      } else { s[id] = null; faltantes.push(g+': respuesta pendiente ('+(r==='nose'?'No se':'sin responder')+')'); }
    }
  }
  return { scores: s, evidencias: evid, faltantes };
}

function dimensiones(s) {
  const mx = (...k) => Math.max(...k.map(x => s[x]));
  return { economica: mx('E1','E2','E3'), operativa: mx('O1','O2','O3'), juridica: mx('J1','J2','J3'), tecnologica: mx('T1','T2','T3') };
}

function clasificar(d) {
  const total = d.economica + d.operativa + d.juridica + d.tecnologica;
  const alguna3 = Object.values(d).some(v => v === 3);
  let c = 'BAJO';
  if (alguna3 || total >= 8) c = 'ALTO'; else if (total >= 4) c = 'MEDIO';
  return { total, clasificacion: c, nivelMatriz: c === 'BAJO' ? 'N1' : c === 'MEDIO' ? 'N2' : 'N3' };
}

// Elegibilidad de OS segun Legal. Devuelve nivel minimo y la regla aplicada.
function elegibilidadOS(e, params) {
  const monto = e.montoEvaluado || 0;
  const activas = params.exclusiones.filter(x => x.activa);
  const marcadas = activas.filter(x => (e.exclusiones || {})[x.id] === 'si');
  const tipo = params.tipos.find(t => t.id === e.tipoCompra);
  const giro = !!(tipo && tipo.giroElegible);
  const pendientes = activas.filter(x => (e.exclusiones || {})[x.id] === undefined || (e.exclusiones || {})[x.id] === 'nose');
  if (monto <= params.topeVigente) {
    const bloq = marcadas.filter(x => x.aplicaBajoTope);
    if (!bloq.length) return { elegible: true, pendientes: pendientes.length, regla: `Monto evaluado (USD ${fmt(monto)}) dentro del tope vigente de OS (USD ${fmt(params.topeVigente)}).` };
    return { elegible: false, pendientes: 0, regla: `No elegible para OS: exclusión de Legal aplicable aún bajo el tope vigente (${bloq.map(x=>x.id+' '+x.texto).join('; ')}).` };
  }
  if (marcadas.length) return { elegible: false, pendientes: 0, regla: `No elegible para OS por exclusión de Legal (${marcadas.map(x=>x.id+' '+x.texto).join('; ')}).` };
  if (monto <= params.topeAmpliado) return { elegible: true, pendientes: pendientes.length, regla: `Monto evaluado (USD ${fmt(monto)}) dentro del tope ampliado de OS (USD ${fmt(params.topeAmpliado)}) y sin exclusiones.` };
  if (giro) {
    const abs = params.topeAbsolutoGiros;
    if (abs == null || abs === '' || monto <= Number(abs))
      return { elegible: true, pendientes: pendientes.length, regla: `Giro elegible para OS (${tipo.nombre}) sin exclusiones; monto evaluado USD ${fmt(monto)} sobre el tope ampliado.` + (abs ? ` Tope absoluto para giros: USD ${fmt(abs)}.` : '') };
    return { elegible: false, pendientes: 0, regla: `Giro elegible, pero el monto evaluado (USD ${fmt(monto)}) supera el tope absoluto para giros (USD ${fmt(abs)}).` };
  }
  return { elegible: false, pendientes: 0, regla: `Monto evaluado (USD ${fmt(monto)}) supera el tope ampliado y el tipo de compra no es un giro elegible.` };
}

function fmt(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

const HINTS = [
  { id: 1, test: s => s.T2 >= 2, txt: 'T2 alta: revisa el disparador 1 (información personal o confidencial).' },
  { id: 2, test: s => s.T1 >= 2, txt: 'T1 alta: revisa el disparador 2 (acceso a sistemas o infraestructura).' },
  { id: 3, test: s => s.T3 >= 2 || s.J3 === 3, txt: 'T3 o J3 altas: revisa el disparador 3 (software o propiedad intelectual).' },
  { id: 4, test: s => s.O1 === 3, txt: 'O1 = 3: revisa el disparador 4 (servicio crítico).' },
  { id: 5, test: s => s.J1 >= 2, txt: 'J1 alta: revisa el disparador 5 (obligaciones regulatorias).' },
  { id: 6, test: s => s.E2 >= 2, txt: 'E2 alta: revisa el disparador 6 (anticipos, garantías o penalizaciones).' }
];

function evaluar(entrada, params) {
  params = params || DEFAULT_PARAMS;
  const { scores, evidencias, faltantes } = construirPuntuaciones(entrada, params);
  const elig = elegibilidadOS(entrada, params);
  const out = { scores, evidencias, faltantes: [...faltantes], elegibilidadOS: elig, alertas: [], avisos: [] };
  const exclFalt = elig.pendientes;
  if (exclFalt) out.faltantes.push('Filtros de Legal (X1-X5): hay respuestas pendientes');
  const topes = (entrada.disparadores || {});
  const dispSi = Object.keys(topes).filter(k => topes[k] && topes[k].valor === 'si');
  const dispPend = Object.keys(topes).filter(k => topes[k] && topes[k].valor === 'nose');
  if (dispPend.length) out.faltantes.push('Disparadores: hay respuestas pendientes');
  
  out.disparadoresSi = dispSi.map(Number);
  // alertas de acumulado
  const lim = params.topeAmpliado * (params.alertaPct / 100);
  if (entrada.montoEvaluado > params.topeAmpliado && entrada.acumulado > 0) out.alertas.push(`Acumulado con el mismo proveedor y obra: USD ${fmt(entrada.montoEvaluado)} supera el tope ampliado de USD ${fmt(params.topeAmpliado)}. Posible fragmentación.`);
  else if (entrada.montoEvaluado >= lim) out.alertas.push(`El monto evaluado alcanza el ${params.alertaPct}% del tope ampliado de OS.`);
  if (out.faltantes.length) {
    out.estado = 'PENDIENTE';
    out.recomendacion = params.textos.PENDIENTE;
    return out;
  }
  const d = dimensiones(scores); const c = clasificar(d);
  Object.assign(out, { dimensiones: d }, c);
  out.nivelLegal = elig.elegible ? 'N1' : 'N2';
  out.nivelFinal = NIVEL[out.nivelMatriz] >= NIVEL[out.nivelLegal] ? out.nivelMatriz : out.nivelLegal;
  if (NIVEL[out.nivelMatriz] > NIVEL[out.nivelLegal]) out.reglaDeterminante = `Matriz de riesgo: ${c.clasificacion} (puntaje ${c.total}/12) exige ${out.nivelMatriz}.`;
  else if (NIVEL[out.nivelLegal] > NIVEL[out.nivelMatriz]) out.reglaDeterminante = `Regla de Legal: ${elig.regla}`;
  else out.reglaDeterminante = `Matriz de riesgo: ${c.clasificacion} (puntaje ${c.total}/12). ` + (elig.elegible ? elig.regla : 'Regla de Legal: ' + elig.regla);
  out.instrumento = NOMBRE_NIVEL[out.nivelFinal];
  out.bloqueada = dispSi.some(k => (topes[k].estado || 'Pendiente') !== 'Atendida');
  out.recomendacion = out.bloqueada ? params.textos.BLOQUEADA : params.textos[out.nivelFinal];
  if (params.avisoInformativo) for (const h of HINTS) if (h.test(scores) && !dispSi.includes(h.id)) out.avisos.push(h.txt);
  return out;
}

// Reglas de quien puede cambiar el instrumento manualmente
function puedeAjustar(roles, nivelActual, nivelNuevo) {
  if (NIVEL[nivelNuevo] === NIVEL[nivelActual]) return false;
  const sube = NIVEL[nivelNuevo] > NIVEL[nivelActual];
  if (roles.includes('legal') || roles.includes('admin')) return true;
  if (roles.includes('compras')) return sube;
  return false;
}

// Los disparadores se proponen a partir de las respuestas (el solicitante no los captura).
// Compras o Legal pueden corregirlos con justificacion. Los nulos cuentan como 0.
function derivarDisparadores(scores, manual) {
  const z = {}; for (const k of IDS) z[k] = scores[k] == null ? 0 : scores[k];
  const out = {};
  for (const h of HINTS) { const auto = h.test(z); const m = manual && manual[h.id]; out[h.id] = { valor: m ? m : (auto ? 'si' : 'no'), auto: !m }; }
  return out;
}
module.exports = { derivarDisparadores, evaluar, bandaE1, construirPuntuaciones, elegibilidadOS, puedeAjustar, IDS, GATES, NIVEL, NOMBRE_NIVEL, fmt };
