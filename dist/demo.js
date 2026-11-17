import {defaults} from './config.js';
import {evaluate,tasksFor,deriveTriggers} from './engine.js';
// La demo corre con los tres perfiles del proceso: Solicitante, Compras y Legal.
export const demoParams={...structuredClone(defaults),reduced:true,authorization:false,budget:false};
export const providers=[{name:'Aceros del Caribe',tax:'DEMO-AC01',status:'Activo'},{name:'Maquinaria del Sureste',tax:'DEMO-MS02',status:'Activo'},{name:'Servicios Integrales Riviera',tax:'DEMO-SR03',status:'Activo'},{name:'Concretos del Caribe',tax:'DEMO-CC04',status:'Activo'},{name:'Andamios y Cimbras Peninsular',tax:'DEMO-AP05',status:'En alta'}];
export function sample(kind='A') {
 const d={work:'OBR',type:'0',description:'Varilla de acero para obra',quantity:'120',unit:'Piezas',amount:18000,start:'2026-11-11',end:'2026-12-11',required:'2026-11-25',providerKind:'existing',provider:providers[0].name,tax:providers[0].tax,x:Array(5).fill(false),guide:Array(7).fill('No'),scores:{O1:1,O2:1,O3:0},evidence:{O1:'Material con alternativas disponibles',O2:'Impacto localizado y temporal',O3:'Sustitución inmediata'},triggers:Array(6).fill(false),demo:true};
 if(kind==='B') Object.assign(d,{type:'1',description:'Retroexcavadora usada',amount:22000,provider:providers[1].name,tax:providers[1].tax,scores:{...d.scores,O3:1}});
 if(kind==='C') {d.description='Material de obra con anticipo';d.amount=9000;d.guide[5]='Sí';d.scores.E2=3;d.evidence.E2='Anticipo del 100 % no reembolsable';d.triggers[5]=true;}
 if(kind==='D') {Object.assign(d,{description:'Arrendamiento de grúa con operador',type:'3',amount:20000,scores:{O1:2,O2:2,O3:2,J2:3},evidence:{O1:'Proceso importante',O2:'Afectación relevante',O3:'Alternativas limitadas',J2:'Personal continuo en sitio'}});d.guide[2]='Sí';d.x[4]=true;}
 if(kind==='E') {Object.assign(d,{description:'Subcontrato de cimentación',type:'4',amount:60000});d.x.splice(0,3,true,true,true);d.scores.O1=3;d.evidence.O1='Servicio indispensable para operación crítica';}
 if(kind==='F') {d.amount=8000;d.scores.O3=1;d.evidence.O3='Transición sencilla con otro proveedor';}
 if(kind==='G') {Object.assign(d,{description:'Servicio con datos personales',type:'5',amount:5000,provider:providers[2].name,tax:providers[2].tax});d.guide[0]='Sí';Object.assign(d.scores,{T1:1,T2:3});Object.assign(d.evidence,{T1:'Acceso temporal limitado',T2:'Datos personales de clientes'});d.triggers[0]=true;}
 if(kind==='H') {d.amount=20000;d.scores.O3=1;d.evidence.O3='Transición sencilla';}
 if(kind==='I') {d.amount=12000;d.x[0]=true;}
 if(kind==='J') d.guide[0]='No sé';
 if(kind==='L') {Object.assign(d,{description:'Arrendamiento de andamios para torre B',type:'3',amount:30000,providerKind:'new',provider:providers[4].name,tax:providers[4].tax,scores:{O1:1,O2:1,O3:1},evidence:{O1:'Apoya una actividad secundaria',O2:'Impacto localizado y temporal',O3:'Alternativas disponibles'}});}
 return d;
}
const T=(days,hours=0)=>new Date(Date.now()-days*86400000-hours*3600000).toISOString();
// folio de ejemplo: [clave, solicitante, estado, instrumento confirmado, ajustes]
const plan=[
 ['A','solicitante','En análisis de Compras',null,r=>{r.requests=[{id:'q-a1',from:'Compras',to:'Solicitante',topic:'Cotización o documentos',text:'Adjunta la cotización vigente firmada por el proveedor y confirma el tiempo de entrega.',at:T(0,3),by:'compras@demo.itm',status:'Abierta'}];r.history.push({action:'Información solicitada a Solicitante',at:T(0,3),user:'compras@demo.itm',comment:'[Cotización o documentos] Adjunta la cotización vigente firmada.'});}],
 ['C','solicitante','Bloqueada por revisión especializada',null,r=>{r.requests=[{id:'q-c1',from:'Legal',to:'Compras',topic:'Información para el contrato',text:'Necesito el modelo de contrato aplicable y las condiciones del anticipo con el proveedor (monto, garantía y plazo de recuperación).',at:T(1,2),by:'legal@demo.itm',status:'Abierta'}];r.history.push({action:'Información solicitada a Compras',at:T(1,2),user:'legal@demo.itm',comment:'[Información para el contrato] Necesito el modelo de contrato aplicable.'});}],
 ['L','ingenieria','En análisis de Compras',null,()=>{}],
 ['B','solicitante','Análisis concluido',1,r=>{r.format={at:T(2),user:'compras@demo.itm',last:T(2),count:1};r.concluded={at:T(2),user:'compras@demo.itm'};r.history.push({action:'Instrumento confirmado o ajustado',at:T(2),user:'compras@demo.itm',comment:'Orden de Servicio'},{action:'Análisis concluido · Compras continúa en el sistema de adquisiciones',at:T(2),user:'compras@demo.itm',comment:''});}],
 ['D','ingenieria','En formalización',3,r=>{r.requests=[{id:'q-d1',from:'Legal',to:'Compras',topic:'Alcance o especificaciones',text:'¿El operador de la grúa será personal del proveedor? Necesito el alcance exacto del servicio.',at:T(3),by:'legal@demo.itm',status:'Respondida',answer:'Sí, el operador es del proveedor y trabajará en sitio de lunes a sábado. Se anexó el alcance firmado.',answeredAt:T(2),answeredBy:'compras@demo.itm'}];r.history.push({action:'Instrumento confirmado o ajustado',at:T(3),user:'compras@demo.itm',comment:'Contrato formal por personal continuo en sitio'});}],
 ['G','solicitante','Bloqueada por revisión especializada',null,()=>{}],
 ['H','solicitante','Análisis concluido',1,r=>{r.description='Cemento gris para losa de nivel 2';r.format={at:T(6),user:'compras@demo.itm',last:T(6),count:1};r.concluded={at:T(5),user:'compras@demo.itm'};r.history.push({action:'Análisis concluido · Compras continúa en el sistema de adquisiciones',at:T(5),user:'compras@demo.itm',comment:''});}],
 ['E','ingenieria','En formalización',3,r=>{r.tasks.forEach(t=>Object.assign(t,{done:true,comment:'Contrato formal firmado',user:'legal@demo.itm',at:T(3)}));r.history.push({action:'Legal concluyó su parte',at:T(3),user:'legal@demo.itm',comment:'Contrato formal firmado'});}],
 ['I','solicitante','En análisis de Compras',null,r=>{r.description='Varilla corrugada para cimentación';}]
];
export function seed(p=defaults){
 const year=new Intl.DateTimeFormat('en',{timeZone:'America/Cancun',year:'numeric'}).format(new Date());
 const owners={solicitante:'solicitante@demo.itm',ingenieria:'ingenieria@demo.itm'};
 return plan.map(([kind,owner,statusName,confirmed,tweak],i)=>{
  const d=sample(kind);d.triggers=deriveTriggers(d);
  const evaluation=evaluate(d,p),sentAt=T(i+1),tasks=tasksFor(d,p,evaluation);
  const row={...d,id:'demo-'+i,folio:'OBR-'+year+'-'+String(plan.length-i).padStart(4,'0'),owner:owners[owner],sentAt,status:statusName,evaluation:{...evaluation,params:p},tasks,requests:[],history:[{action:'Envío a Compras',at:sentAt,user:owners[owner]}]};
  if(confirmed)row.finalLevel=confirmed;
  tweak(row);
  return row;
 });
}
