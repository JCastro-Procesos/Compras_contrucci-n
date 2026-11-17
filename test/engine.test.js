import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults as p} from '../dist/config.js';
import {evaluate,accumulate,canSee,deriveTriggers,stageInfo,legalOwns,tasksFor} from '../dist/engine.js';
import {sample,providers,seed,demoParams} from '../dist/demo.js';
import {command} from '../dist/workflow.js';
const scenarios=[
 ['A',0,1,'BAJO',2,false],
 ['B',0,1,'BAJO',2,false],
 ['C',0,3,'ALTO',4,true],
 ['D',0,3,'ALTO',6,false],
 ['E',0,3,'ALTO',5,false],
 ['F',24000,1,'BAJO',3,false],
 ['G',0,3,'ALTO',5,true],
 ['H',0,1,'BAJO',2,false]
];
for(const [key,previous,level,risk,total,blocked] of scenarios)test('Aceptación '+key,()=>{
 const r=evaluate(sample(key),p,previous);
 assert.deepEqual([r.level,r.risk,r.total,r.blocked],[level,risk,total,blocked]);
 assert.equal(Object.keys(r.scores).length,12);
 if(key==='F'){assert.equal(r.amount,32000);assert.equal(r.alert,true);assert.equal(r.fragmentation,true);}
});
test('Aceptación I · exclusiones debajo del tope',()=>{
 assert.equal(evaluate(sample('I'),p).level,1);
 assert.equal(evaluate(sample('I'),{...p,applyBelow:true}).level,2);
});
test('Aceptación J · «No sé» deja la evaluación pendiente',()=>assert.equal(evaluate(sample('J'),p).level,0));
const user=(role,email=role+'@example.org')=>({email,roles:[role]});
const requester=user('Solicitante');
const stateFor=()=>({demo:true,params:structuredClone(p),rows:[],providers:structuredClone(providers),audit:[]});
const submit=(state,key)=>command(state,requester,{action:'send',data:{...sample(key),file:{name:'cotizacion.pdf'}}}).row;
test('Aceptación K · solo Legal puede bajar el instrumento',()=>{
 const state=stateFor(),r=submit(state,'C');
 assert.equal(canSee(r,user('Solicitante','otra@example.org')),false);
 assert.throws(()=>command(state,requester,{action:'instrument',id:r.id,level:1,comment:'Prueba'}));
 assert.throws(()=>command(state,user('Compras'),{action:'instrument',id:r.id,level:1,comment:'Prueba'}));
 command(state,user('Legal'),{action:'instrument',id:r.id,level:2,comment:'Revisión jurídica'});
 assert.equal(r.finalLevel,2);assert.equal(r.evaluation.level,3);
 assert.throws(()=>command(state,user('Administrador'),{action:'deleteAudit',id:r.id,comment:'Prueba'}));
});
test('Los disparadores bloquean hasta completar cada tarea especializada',()=>{
 const state=stateFor(),r=submit(state,'C');
 assert.throws(()=>command(state,user('Compras'),{action:'advance',id:r.id,comment:'Prueba'}));
 const tasks=r.tasks.filter(t=>t.special);
 for(const t of tasks)command(state,user(t.role),{action:'review',id:r.id,task:t.id,comment:'Controles documentados'});
 assert.equal(r.status,'En análisis de Compras');assert.equal(r.evaluation.level,3);
});
test('El acumulado usa obra, ID fiscal, ventana y estados válidos',()=>{
 const d={...sample(),id:'self'},row={...d,folio:'A',sentAt:'2026-11-01T00:00:00Z',status:'Autorizada',amount:8000};
 const rows=[row,{...row,id:'ok',tax:d.tax.toLowerCase()},{...row,id:'wrong',work:'CRJ'},{...row,id:'old',sentAt:'2024-01-01T00:00:00Z'},{...row,id:'cancel',status:'Cancelada'}];
 assert.equal(accumulate(rows,d,p,new Date('2026-11-11')),8000);
});
test('El folio es consecutivo y la evaluación conserva la configuración',()=>{
 const state=stateFor(),first=submit(state,'A'),second=submit(state,'B');
 assert.match(first.folio,/OBR-\d{4}-0001/);assert.match(second.folio,/OBR-\d{4}-0002/);
 command(state,user('Administrador'),{action:'params',params:{current:15000}});
 assert.equal(first.evaluation.params.current,14000);
 assert.equal(state.params.version,2);
});
test('El flujo termina al concluir el análisis: autorización y formato en orden',()=>{
 const state=stateFor(),r=submit(state,'A');
 const run=(role,action,extra={})=>command(state,user(role),{action,id:r.id,comment:'Validado',...extra});
 run('Compras','instrument',{level:1});
 assert.throws(()=>run('Compras','advance'));
 run('Finanzas','review',{task:'budget'});
 assert.throws(()=>run('Compras','advance'),/formato/i);
 assert.throws(()=>run('Solicitante','format'),/Compras/);
 run('Compras','format');
 run('Compras','advance');
 assert.equal(r.status,'Pendiente de autorización');
 assert.throws(()=>run('Administrador','authorize',{decision:'Aprobada'}));
 run('Dirección de Obra','authorize',{decision:'Aprobada'});
 assert.equal(r.status,'Análisis concluido');
 assert.throws(()=>run('Compras','milestone',{stage:'requisition'}),/terminó/i);
});

const reducedState=()=>({demo:true,params:structuredClone(demoParams),rows:[],providers:structuredClone(providers),audit:[]});
test('Los disparadores se derivan de las respuestas',()=>{
 assert.deepEqual(deriveTriggers(sample('C')),[false,false,false,false,false,true]);
 assert.deepEqual(deriveTriggers(sample('G')),[true,false,false,false,false,false]);
 assert.deepEqual(deriveTriggers(sample('A')),Array(6).fill(false));
 const stale={...sample('A'),scores:{...sample('A').scores,E2:3}};
 assert.equal(deriveTriggers(stale)[5],false);
});
test('Proveedor nuevo: queda en alta y bloquea el avance hasta activarlo',()=>{
 const state=reducedState(),d={...sample('L'),triggers:deriveTriggers(sample('L'))};
 const r=command(state,requester,{action:'send',data:{...d,file:{name:'c.pdf'}}}).row;
 assert.equal(state.providers.find(x=>x.tax===d.tax).status,'En alta');
 assert.equal(r.evaluation.level,2);
 const compras=user('Compras');
 command(state,compras,{action:'instrument',id:r.id,level:2,comment:'Contrato Marco'});
 assert.throws(()=>command(state,compras,{action:'advance',id:r.id,comment:'ok'}),/proveedor/i);
 command(state,compras,{action:'provider',provider:{name:d.provider,tax:d.tax,status:'Activo'}});
 command(state,compras,{action:'format',id:r.id});
 command(state,compras,{action:'advance',id:r.id,comment:'ok'});
 assert.equal(r.status,'Análisis concluido');assert.ok(r.concluded);
});
test('Solicitudes de información: Compras↔Solicitante y Legal→Compras',()=>{
 const state=reducedState(),r=command(state,requester,{action:'send',data:{...sample('D'),triggers:deriveTriggers(sample('D')),file:{name:'c.pdf'}}}).row;
 const compras=user('Compras'),legal=user('Legal');
 assert.equal(legalOwns(r),true);
 assert.throws(()=>command(state,legal,{action:'ask',id:r.id,to:'Solicitante',comment:'x'}));
 command(state,compras,{action:'ask',id:r.id,to:'Solicitante',topic:'Información del proveedor',comment:'Envía datos fiscales'});
 command(state,compras,{action:'instrument',id:r.id,level:3,comment:'Formal'});
 assert.throws(()=>command(state,compras,{action:'advance',id:r.id,comment:'ok'}),/información/i);
 const q=r.requests[0];
 assert.throws(()=>command(state,compras,{action:'answer',id:r.id,request:q.id,comment:'x'}));
 command(state,requester,{action:'answer',id:r.id,request:q.id,comment:'Datos enviados'});
 command(state,compras,{action:'ack',id:r.id,request:q.id});
 assert.equal(q.status,'Atendida');
 command(state,legal,{action:'ask',id:r.id,to:'Compras',topic:'Información para el contrato',comment:'Falta alcance'});
 assert.throws(()=>command(state,legal,{action:'review',id:r.id,task:'legal',comment:'listo'}),/respuesta/i);
 command(state,compras,{action:'answer',id:r.id,request:r.requests[1].id,comment:'Alcance anexo'});
 command(state,legal,{action:'review',id:r.id,task:'legal',comment:'Contrato firmado'});
 assert.equal(r.history.at(-1).action,'Legal concluyó su parte');
 command(state,compras,{action:'format',id:r.id});
 command(state,compras,{action:'advance',id:r.id,comment:'ok'});
 assert.equal(r.status,'Análisis concluido');assert.ok(r.concluded);
});
test('Legal solo modifica solicitudes que requieren contrato; ve todas',()=>{
 const state=reducedState(),legal=user('Legal'),compras=user('Compras');
 const os=command(state,requester,{action:'send',data:{...sample('A'),file:{name:'c.pdf'}}}).row;
 assert.equal(legalOwns(os),false);assert.equal(canSee(os,legal),true);
 assert.throws(()=>command(state,legal,{action:'instrument',id:os.id,level:2,comment:'x'}),/contrato/i);
 command(state,compras,{action:'legalReview',id:os.id,comment:'Cláusula especial'});
 assert.equal(legalOwns(os),true);
 command(state,legal,{action:'instrument',id:os.id,level:2,comment:'x'});
 const draft={id:'d',owner:'otro@x',status:'Borrador'};
 assert.equal(canSee(draft,legal),false);
});
test('Seguimiento: etapas y quién espera según la solicitud',()=>{
 const rows=seed(demoParams),by=d=>rows.find(r=>r.description.startsWith(d));
 const done=stageInfo(by('Cemento'),demoParams);
 assert.ok(done.stages.every(s=>s.state==='done'));
 const asked=stageInfo(by('Varilla de acero para obra'),demoParams);
 assert.equal(asked.waiting,'Solicitante');
 const formal=stageInfo(by('Arrendamiento de grúa'),demoParams);
 assert.equal(formal.stages[formal.cur].k,'contract');assert.equal(formal.waiting,'Legal');
 assert.equal(formal.stages.some(s=>s.k==='auth'),false);
 assert.equal(stageInfo(by('Retroexcavadora'),{authorization:true}).stages.some(s=>s.k==='auth'),true);
});
test('El modo de 3 perfiles reúne las revisiones especializadas en Legal',()=>{
 const d=sample('G');d.triggers=deriveTriggers(d);
 const tasks=tasksFor(d,demoParams,evaluate(d,demoParams));
 assert.deepEqual(tasks.map(t=>t.role),['Legal','Legal']);
 assert.equal(tasks.some(t=>t.role==='Finanzas'),false);
});

test('Compras ajusta topes y Legal recibe aviso', () => {
  const state={...reducedState(),notices:[]};
  const compras={email:'c@x',name:'C',roles:['Compras']},legal={email:'l@x',name:'L',roles:['Legal']},sol={email:'s@x',name:'S',roles:['Solicitante']};
  assert.throws(()=>command(state,sol,{action:'params',params:{current:15000}}));
  assert.throws(()=>command(state,compras,{action:'params',params:{questions:{}}}),/solo ajusta/i);
  assert.throws(()=>command(state,compras,{action:'params',params:{current:state.params.current}}),/cambios/i);
  command(state,compras,{action:'params',params:{current:15000,expanded:30000}});
  assert.equal(state.params.current,15000);
  assert.equal(state.notices.length,1);
  assert.equal(state.notices[0].changes.length,2);
  const id=state.notices[0].id;
  assert.throws(()=>command(state,compras,{action:'notice',id}));
  command(state,legal,{action:'notice',id});
  assert.ok(state.notices[0].read);
  assert.throws(()=>command(state,legal,{action:'notice',id}));
});
