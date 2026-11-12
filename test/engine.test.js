'use strict';
const test = require('node:test'); const assert = require('node:assert');
const { evaluar } = require('../server/engine');
const P = require('../server/defaults');
const NO7 = { G1:'no',G2:'no',G3:'no',G4:'no',G5:'no',G6:'no',G7:'no' };
const XNO = { X1:'no',X2:'no',X3:'no',X4:'no',X5:'no' };
const D0 = () => { const d = {}; for (let i=1;i<=6;i++) d[i] = { valor:'no' }; return d; };
const base = o => ({ tipoCompra:'material_obra', montoEvaluado:1, acumulado:0, gates:NO7, exclusiones:XNO, disparadores:D0(), scores:{O1:1,O2:1,O3:1}, evidencias:{O1:'x',O2:'x',O3:'x'}, ...o });

test('A varilla 18k -> BAJO, N1 por tope ampliado', () => {
  const r = evaluar(base({ montoEvaluado:18000, scores:{O1:1,O2:1,O3:0}, evidencias:{O1:'x',O2:'x'} }), P);
  assert.equal(r.total, 2); assert.equal(r.clasificacion,'BAJO'); assert.equal(r.nivelFinal,'N1');
});
test('B retroexcavadora usada 22k -> N1', () => {
  const r = evaluar(base({ tipoCompra:'equipo_usado', montoEvaluado:22000 }), P);
  assert.equal(r.nivelFinal,'N1');
});
test('C anticipo 100% no reembolsable -> ALTO, bloqueada, N3', () => {
  const d = D0(); d[6] = { valor:'si', estado:'Pendiente' };
  const r = evaluar(base({ montoEvaluado:9000, gates:{...NO7,G6:'si'}, scores:{O1:1,O2:1,O3:1,E2:3}, evidencias:{O1:'x',O2:'x',O3:'x',E2:'100% anticipo'}, disparadores:d }), P);
  assert.equal(r.clasificacion,'ALTO'); assert.equal(r.nivelFinal,'N3'); assert.equal(r.bloqueada,true);
  d[6].estado='Atendida';
  assert.equal(evaluar(base({ montoEvaluado:9000, gates:{...NO7,G6:'si'}, scores:{O1:1,O2:1,O3:1,E2:3}, evidencias:{O1:'x',O2:'x',O3:'x',E2:'ok'}, disparadores:d }), P).bloqueada,false);
  assert.equal(evaluar(base({ montoEvaluado:9000, gates:{...NO7,G6:'si'}, scores:{O1:1,O2:1,O3:1,E2:3}, evidencias:{O1:'x',O2:'x',O3:'x',E2:'ok'}, disparadores:d }), P).nivelFinal,'N3');
});
test('D grua con operador -> ALTO por J2=3, N3', () => {
  const r = evaluar(base({ tipoCompra:'arrendamiento', montoEvaluado:20000, exclusiones:{...XNO,X5:'si'}, gates:{...NO7,G3:'si'}, scores:{O1:2,O2:2,O3:2,J2:3}, evidencias:{O1:'x',O2:'x',O3:'x',J2:'x'} }), P);
  assert.equal(r.clasificacion,'ALTO'); assert.equal(r.nivelFinal,'N3'); assert.equal(r.elegibilidadOS.elegible,false);
});
test('E subcontrato 60k -> N3', () => {
  const r = evaluar(base({ tipoCompra:'subcontrato', montoEvaluado:60000, exclusiones:{X1:'si',X2:'si',X3:'si',X4:'no',X5:'no'}, scores:{O1:3,O2:2,O3:2}, evidencias:{O1:'x',O2:'x',O3:'x'} }), P);
  assert.equal(r.nivelFinal,'N3'); assert.equal(r.scores.E1,2);
});
test('F cuarto pedido, acumulado 32k -> N1 con alerta', () => {
  const r = evaluar(base({ montoEvaluado:32000, acumulado:24000 }), P);
  assert.equal(r.scores.E1,2); assert.equal(r.total,3); assert.equal(r.nivelFinal,'N1'); assert.ok(r.alertas.length>0);
});
test('F2 giro elegible sobre el tope absoluto -> no elegible (N2 minimo)', () => {
  const r = evaluar(base({ montoEvaluado:60000 }), P);
  assert.equal(r.nivelFinal,'N2');
  const sin = evaluar(base({ montoEvaluado:60000 }), { ...P, topeAbsolutoGiros:null });
  assert.equal(sin.nivelFinal,'N1');
});
test('G servicio 5k con datos personales -> ALTO, bloqueada', () => {
  const d = D0(); d[1] = { valor:'si' };
  const r = evaluar(base({ tipoCompra:'servicio_prof', montoEvaluado:5000, gates:{...NO7,G1:'si'}, scores:{O1:1,O2:1,O3:1,T1:0+1,T2:3}, evidencias:{O1:'x',O2:'x',O3:'x',T1:'x',T2:'x'}, disparadores:d }), P);
  assert.equal(r.clasificacion,'ALTO'); assert.equal(r.bloqueada,true); assert.equal(r.nivelFinal,'N3');
});
test('H insumos estandar 20k -> N1', () => {
  assert.equal(evaluar(base({ montoEvaluado:20000 }), P).nivelFinal,'N1');
});
test('I 12k con mano de obra: exclusion X1 aplica bajo el tope (propuesta) -> N2; apagada -> N1', () => {
  const e = base({ tipoCompra:'otro', montoEvaluado:12000, exclusiones:{...XNO,X1:'si'} });
  assert.equal(evaluar(e, P).nivelFinal,'N2');
  const off = { ...P, exclusiones: P.exclusiones.map(x => ({ ...x, aplicaBajoTope:false })) };
  assert.equal(evaluar(e, off).nivelFinal,'N1');
});
test('J "No se" -> PENDIENTE sin instrumento', () => {
  const r = evaluar(base({ gates:{...NO7,G2:'nose'} }), P);
  assert.equal(r.estado,'PENDIENTE'); assert.equal(r.instrumento, undefined);
});
test('Bandas E1 y 0 sin monto', () => {
  const { bandaE1 } = require('../server/engine');
  assert.equal(bandaE1(0,P.bandasE1),0); assert.equal(bandaE1(25000,P.bandasE1),1); assert.equal(bandaE1(25001,P.bandasE1),2); assert.equal(bandaE1(100001,P.bandasE1),3);
});
test('derivarDisparadores propone segun las puntuaciones y respeta el ajuste manual', () => {
  const { derivarDisparadores } = require('../server/engine');
  const z = { E1:1,E2:3,E3:0,O1:1,O2:1,O3:1,J1:0,J2:0,J3:0,T1:0,T2:3,T3:0 };
  const d = derivarDisparadores(z); assert.equal(d[6].valor,'si'); assert.equal(d[1].valor,'si'); assert.equal(d[4].valor,'no');
  assert.equal(derivarDisparadores(z, { 1:'no' })[1].valor,'no');
});
test('Ajustes: compras solo sube, legal sube y baja', () => {
  const { puedeAjustar } = require('../server/engine');
  assert.equal(puedeAjustar(['compras'],'N1','N2'),true); assert.equal(puedeAjustar(['compras'],'N3','N2'),false);
  assert.equal(puedeAjustar(['legal'],'N3','N2'),true); assert.equal(puedeAjustar(['solicitante'],'N1','N3'),false);
});
