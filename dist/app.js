import {defaults} from './config.js';
import {evaluate,accumulate,canSee,groups,instruments,money,roles,deriveTriggers,stageInfo,legalOwns,lvlOf,topics,DONE,isConcluded} from './engine.js';
import {providers,seed,sample,demoParams} from './demo.js';
import {command} from './workflow.js';

const icons={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',file:'M6 3h8l4 4v14H6z M14 3v5h5 M9 12h6m-6 4h6',cart:'M3 4h2l2 11h12l2-7H6m3 12h.01M17 20h.01',shield:'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z M9 12l2 2 4-4',check:'M5 12l4 4L19 6',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M22 21v-2a4 4 0 0 0-3-4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M10 2h4l1 3 3 1 3 2-1 4 1 4-3 2-3 1-1 3h-4l-1-3-3-1-3-2 1-4-1-4 3-2 3-1z',history:'M3 12a9 9 0 1 1 3 7 M3 5v7h7 M12 7v5l4 2',plus:'M12 5v14M5 12h14',down:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',lock:'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3',cash:'M3 5h18v14H3z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',info:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 11v6m0-10h.01',menu:'M4 6h16M4 12h16M4 18h16',logout:'M10 4H4v16h6m4-12 4 4-4 4m-6-4h12',print:'M6 9V3h12v6 M6 18H4v-7h16v7h-2 M6 14h12v7H6z',chat:'M21 12a8 8 0 0 1-11.5 7.2L4 20l1.2-4.6A8 8 0 1 1 21 12z',refresh:'M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5',scale:'M12 3v18 M5 21h14 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0z M19 7l-3 7a3 3 0 0 0 6 0z'};
const icon=n=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+icons[n]+'"></path></svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const date=v=>v?new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeZone:'America/Cancun'}).format(new Date(v)):'—';
const when=v=>v?new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short',timeZone:'America/Cancun'}).format(new Date(v)):'—';
// Los tres perfiles del proceso. El resto de los roles sigue disponible en el servidor real.
const demoUsers=[
 {name:'Enrique Castro',email:'solicitante@demo.itm',roles:['Solicitante'],label:'Solicitante'},
 {name:'Equipo de Compras',email:'compras@demo.itm',roles:['Compras'],label:'Compras'},
 {name:'Equipo Legal',email:'legal@demo.itm',roles:['Legal'],label:'Legal'}
];
const people={'solicitante@demo.itm':'Enrique Castro','ingenieria@demo.itm':'Ana Torres · Ingeniería','compras@demo.itm':'Equipo de Compras','legal@demo.itm':'Equipo Legal'};
const who=e=>people[e]||e;
const demoTips={Solicitante:'Crea una solicitud con «Nueva solicitud» → «Cargar ejemplo de varilla». Estarás pendiente de las dudas que te hagan. Después cambia a Compras para ver cómo la recibe.',Compras:'Abre una solicitud: el cuadro «Qué te toca» te dice el siguiente paso. Confirma el instrumento, imprime el formato y usa «Concluir análisis»; ahí termina el proceso en este sistema. En «Parámetros» puedes cambiar los topes: Legal recibe un aviso.',Legal:'Ves todas las solicitudes, pero solo actúas en las que requieren contrato. Abre «Servicio con datos personales» (o la grúa) y usa «Marcar contrato listo»: tu parte queda terminada. También puedes pedir información a Compras.'};
let demo=false,user,state,previewPrevious=null,view='dashboard',filter={},page=1,wizard=null,step=0,blk=0,selected=null,tab='sum',chip='all',menu=false,toastTimer;
const has=(...r)=>r.some(role=>user?.roles.includes(role));
const params=()=>state.params;
const available=()=>state.rows.filter(r=>!r.hidden&&canSee(r,user));
const btn=(label,action,style='',ico='')=>'<button type="button" class="btn '+style+'" data-action="'+esc(action)+'">'+(ico?icon(ico):'')+esc(label)+'</button>';
const options=(values,current,placeholder='Selecciona')=>(placeholder?'<option value="">'+esc(placeholder)+'</option>':'')+values.map(([value,label])=>'<option value="'+esc(value)+'" '+(String(value)===String(current??'')?'selected':'')+'>'+esc(label)+'</option>').join('');
const select=(name,values,current,placeholder)=>'<select name="'+name+'">'+options(values,current,placeholder)+'</select>';
const badge=(label,tone='',ico='')=>'<span class="badge '+tone+'">'+(ico?icon(ico):'')+esc(label)+'</span>';
const inst=n=>badge(instruments[n||0],['','green','amber','red'][n||0]);
const risk=r=>badge(r||'PENDIENTE',{BAJO:'green',MEDIO:'amber',ALTO:'red'}[r]||'');
const statusText=s=>params().reduced?(s.startsWith('Bloqueada')?'En revisión de Legal':s):s;
const status=r=>badge(statusText(r.status),isConcluded(r.status)?'green':r.status==='Rechazada'?'red':r.status==='Cancelada'?'':r.status.startsWith('Bloqueada')?'amber':'blue',r.status.startsWith('Bloqueada')?'lock':'');
const title=(h,p,actions='',eyebrow='Compras · Construcción')=>'<header class="hero"><div><div class="eyebrow">'+esc(eyebrow)+'</div><h1>'+esc(h)+'</h1><p>'+esc(p)+'</p></div><div class="actions">'+actions+'</div></header>';
const panel=(h,body,sub='',actions='')=>'<section class="panel"><div class="panelheader"><div><h2>'+esc(h)+'</h2>'+(sub?'<p class="muted">'+esc(sub)+'</p>':'')+'</div>'+actions+'</div>'+body+'</section>';
const actionText=(label,action)=>'<button type="button" data-action="'+esc(action)+'">'+esc(label)+'</button>';
const maps=arr=>arr.map((x,i)=>[i,x]);
const metric=(label,value,sub,ic,tone='')=>'<div class="card"><div class="metrichead">'+label+'<span class="square '+tone+'">'+icon(ic)+'</span></div><div class="metric">'+value+'</div><div class="hint">'+sub+'</div></div>';
const hint=t=>t?'<small class="hint">'+esc(t)+'</small>':'';
const closed=r=>isConcluded(r.status)||['Cancelada','Rechazada'].includes(r.status);
const legalTasks=r=>(r.tasks??[]).filter(t=>t.role==='Legal');
const legalDone=r=>legalTasks(r).length>0&&legalTasks(r).every(t=>t.done);
const partDone=r=>!r.folio?'':has('Compras')&&isConcluded(r.status)?'Análisis concluido':has('Legal')&&!has('Compras')&&legalOwns(r)&&legalDone(r)?'Tu parte terminó':'';
function toast(s){$('#toast').textContent=s;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',4000);}
async function api(path,body){
 const result=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 if(!result.headers.get('content-type')?.includes('application/json')) throw new Error('Servicio no disponible.');
 const json=await result.json();if(!result.ok)throw new Error(json.error||'No se pudo completar la operación.');return json;
}
const freshDemo=()=>({demo:true,params:structuredClone(demoParams),rows:seed(demoParams),providers:structuredClone(providers),audit:[],notices:[]});
function loadDemo(){
 try{state=JSON.parse(localStorage.getItem('itm-compra-demo-v4'));}catch{}
 state??=freshDemo();
 user=demoUsers[0];
}
const persist=()=>{try{localStorage.setItem('itm-compra-demo-v4',JSON.stringify(state));}catch{}};
async function send(input){
 if(demo){const result=command(state,user,input);persist();return result;}
 const result=await api('/api/command',input);state=(await api('/api/state')).state;return result;
}
const navigation=[
 ['mine','Mis solicitudes','file',['Solicitante']],
 ['purchases','Bandeja de Compras','cart',['Compras','Administrador']],
 ['legalq','Bandeja de Legal','scale',['Legal']],
 ['dashboard','Indicadores','grid',['Administrador','Dirección de Obra','Legal','Finanzas','Compras']],
 ['reviews','Revisión especializada','shield',['Finanzas','TI y Seguridad','Dirección de Obra','Administrador']],
 ['approvals','Autorizaciones','check',['Dirección de Obra','Administrador']],
 ['providers','Proveedores','users',['Compras','Administrador']],
 ['admin','Parámetros','settings',['Administrador','Compras']],
 ['audit','Bitácora','history',['Administrador']]
];

/* ---------- Seguimiento y pendientes ---------- */
const openReq=r=>(r.requests??[]).filter(q=>q.status==='Abierta');
const mineReq=r=>openReq(r).filter(q=>q.to==='Solicitante'?r.owner===user.email&&has('Solicitante'):has(q.to));
const unacked=r=>(r.requests??[]).filter(q=>q.status==='Respondida'&&has(q.from));
function action(r){
 if(!r.folio)return has('Solicitante')&&r.owner===user.email?'Terminar borrador':'';
 if(closed(r))return '';
 if(mineReq(r).length)return 'Responder información';
 if(unacked(r).length)return 'Revisar respuesta';
 const pending=(r.tasks??[]).some(t=>!t.done&&has(t.role));
 if(has('Legal')&&legalOwns(r)&&pending)return lvlOf(r)===3?'Elaborar contrato formal':'Atender revisión';
 if(has('Compras')){
  if(!r.finalLevel&&!r.authorization)return 'Confirmar instrumento';
  if(['En análisis de Compras','En formalización'].includes(r.status)&&!(r.tasks??[]).some(t=>!t.done))return r.format?(params().authorization===false?'Concluir análisis':'Enviar a autorización'):'Imprimir formato';
 }
 return '';
}

/* ---------- Qué le toca a cada área ---------- */
const myRole=()=>has('Compras')?'Compras':has('Legal')?'Legal':has('Dirección de Obra')?'Dirección de Obra':has('Solicitante')?'Solicitante':user.roles[0];
function partSteps(r){
 const role=myRole(),tasks=r.tasks??[],open=openReq(r),concl=isConcluded(r.status),S=(t,done,how='')=>({t,done,how});
 const prov=state.providers.find(x=>x.tax===r.tax),noAuth=params().authorization===false;
 if(role==='Solicitante')return [S('Enviar la solicitud',true),S('Responder las dudas que Compras o Legal te hagan',!open.some(q=>q.to==='Solicitante'),'Pestaña «Información» → «Responder»'),S('Consultar el resultado',concl,'Cuando Compras concluye el análisis ves el instrumento final. Ahí termina tu parte.')];
 if(role==='Compras')return [
  S('Confirmar el instrumento',!!r.finalLevel,'Botón «Confirmar instrumento»'),
  S('Resolver la información pendiente',!open.length,'Pestaña «Información»'),
  S('Validar al proveedor',prov?.status==='Activo','Botón «Validar y activar proveedor»'),
  ...(tasks.length?[S('Esperar a que Legal y las demás áreas cierren su parte',tasks.every(t=>t.done),'Pestaña «Revisiones y contrato»')]:[]),
  S('Imprimir el formato de análisis',!!r.format,'Botón «Imprimir formato de análisis». Se anexa a la requisición.'),
  S(noAuth?'Concluir el análisis':'Enviar a autorización',concl||r.status==='Pendiente de autorización',noAuth?'Botón «Concluir análisis». Aquí termina el proceso en este sistema.':'Botón «Enviar a autorización»')];
 if(role==='Legal'){
  if(!legalOwns(r))return [];
  return [S('Revisar la solicitud y el instrumento',true),S('Pedir información a Compras si falta algo',!open.some(q=>q.to==='Compras'),'Botón «Pedir información a Compras»'),S(lvlOf(r)===3?'Elaborar el contrato formal':'Completar tu revisión',legalDone(r),'Pestaña «Revisiones y contrato» → «Marcar contrato listo». Con esto tu parte queda terminada.')];
 }
 if(role==='Dirección de Obra')return [S('Revisar la solicitud',true),S('Registrar la decisión',concl||r.status==='Rechazada','Botón «Registrar decisión»')];
 const mine=tasks.filter(t=>t.role===role);
 return mine.map(t=>S(t.label,t.done,'Pestaña «Revisiones» → «Marcar atendida»'));
}
function myPart(r){
 if(!r.folio||['Cancelada','Rechazada'].includes(r.status))return '';
 const list=partSteps(r);if(!list.length)return '';
 const first=list.findIndex(x=>!x.done),role=myRole();
 const finished=first<0;
 const note=has('Legal')&&!has('Compras')&&legalOwns(r)&&legalDone(r)?'<div class="tracknote ok">'+icon('check')+'<span><b>Tu parte terminó.</b> El contrato quedó listo'+(legalTasks(r).find(t=>t.at)?' el '+date(legalTasks(r).find(t=>t.at).at):'')+'. Compras concluirá el análisis; no necesitas hacer nada más en este folio.</span></div>':'';
 return '<section class="panel mypart"><div class="panelheader"><div><h2>Qué te toca en este folio</h2><p class="muted">Pasos de '+esc(role)+(finished?' · todo completo':'')+'</p></div>'+(finished?badge('Tu parte terminó','green','check'):'')+'</div><ol class="todo">'+list.map((x,i)=>'<li class="'+(x.done?'done':i===first?'now':'')+'"><span class="node">'+(x.done?icon('check'):i+1)+'</span><span><b>'+esc(x.t)+'</b>'+(x.how?'<small>'+esc(x.how)+'</small>':'')+'</span></li>').join('')+'</ol>'+note+'</section>';
}

/* ---------- Guía de primer uso ---------- */
const guides={
 Solicitante:{lead:'Tú inicias el proceso y estás pendiente de las dudas que te hagan.',steps:[['Crea la solicitud','Usa «Nueva solicitud»: llena los datos, adjunta la cotización y responde el análisis por bloques. Puedes guardar borrador.'],['Envíala a Compras','Al enviar se genera el folio y el sistema calcula si basta una Orden de Servicio o si se requiere contrato.'],['Revisa tus notificaciones','Si Compras o Legal necesitan algo, verás «Responder información» en tu lista. Respóndela desde la pestaña Información.'],['Consulta el resultado','Cuando Compras concluye el análisis ves el instrumento final. Ahí termina tu parte.']]},
 Compras:{lead:'Tú analizas cada solicitud, reúnes la información y concluyes el análisis.',steps:[['Atiende lo nuevo','En «Por atender» están las solicitudes que esperan algo de ti.'],['Confirma el instrumento','Abre el folio y usa «Confirmar instrumento». Puedes mantenerlo o subirlo; solo Legal puede bajarlo.'],['Pide lo que falte','«Pedir información al solicitante». Si hace falta contrato, Legal entra al folio y te avisa cuando termina.'],['Imprime el formato','«Imprimir formato de análisis»: es obligatorio y se anexa a la requisición.'],['Concluye el análisis','«Concluir análisis» cuando no haya pendientes. Aquí termina el proceso en este sistema: la requisición, la orden, el pago y la recepción se llevan en el sistema de adquisiciones.']]},
 Legal:{lead:'Tú ves todas las solicitudes, pero solo actúas en las que requieren contrato.',steps:[['Revisa tu bandeja','El filtro «Requieren contrato» muestra lo tuyo. El resto es solo consulta.'],['Pide información si falta','Dentro del folio, «Pedir información a Compras».'],['Prepara el contrato','Contrato Marco o formal, según el instrumento del folio.'],['Marca tu parte como terminada','En «Revisiones y contrato» usa «Marcar contrato listo» con un comentario. El folio pasa a «Mi parte terminada» y ya no queda nada pendiente para ti.'],['Atiende los avisos','Si Compras cambia los topes verás un aviso arriba: márcalo como «Enterado».']]},
 Otro:{lead:'Participas cuando una solicitud necesita tu revisión.',steps:[['Abre tu bandeja','Entra a «Revisión especializada» o «Autorizaciones», según tu perfil.'],['Atiende la revisión','Abre el folio y usa el botón de tu área con un comentario.']]}
};
const seenKey='itm-guia-v1';
const seenGuides=()=>{try{return JSON.parse(localStorage.getItem(seenKey))||{}}catch{return {}}};
function showGuide(){
 const role=myRole(),g=guides[role]??guides.Otro,dlg=$('#dialog');
 if(dlg.open)return;
 try{localStorage.setItem(seenKey,JSON.stringify({...seenGuides(),[role]:true}));}catch{}
 dlg.innerHTML='<form method="dialog" class="guide"><h2>Cómo usar el sistema · '+esc(role)+'</h2><p class="muted">'+esc(g.lead)+'</p><div class="flowline" aria-label="Flujo general"><span>Solicitante envía</span><i>→</i><span>Compras analiza</span><i>→</i><span>Legal, si hay contrato</span><i>→</i><span class="end">Compras concluye</span></div><p class="hint">El sistema termina al concluir el análisis. La compra continúa en el sistema de adquisiciones.</p><ol class="todo">'+g.steps.map(([t,d],i)=>'<li><span class="node">'+(i+1)+'</span><span><b>'+esc(t)+'</b><small>'+esc(d)+'</small></span></li>').join('')+'</ol><div class="actions"><button class="btn primary" value="ok">Entendido</button></div></form>';
 dlg.showModal();
}
function maybeGuide(){if(user&&view!=='print'&&!seenGuides()[myRole()])showGuide();}
function tracker(r,size=''){
 const t=stageInfo(r,params());
 return '<ol class="tracker '+size+'" aria-label="Seguimiento de la solicitud">'+t.stages.map((s,i)=>'<li class="'+s.state+(s.state==='current'&&t.open.length?' wait':'')+'"'+(s.state==='current'?' aria-current="step"':'')+'><span class="node">'+(s.state==='done'?icon('check'):s.state==='stopped'?'✕':i+1)+'</span><span class="tlabel">'+esc(s.label)+'<small>'+esc(s.sub||s.who)+'</small></span></li>').join('')+'</ol>';
}
function trackNote(r){
 const t=stageInfo(r,params()),cur=t.stages[t.cur],q=t.open[0];
 if(isConcluded(r.status))return '<div class="tracknote ok">'+icon('check')+'<span><b>Análisis concluido'+(r.concluded?' el '+date(r.concluded.at):'')+'.</b> Instrumento final: '+esc(instruments[lvlOf(r)])+'. Compras continúa con la requisición, la orden de compra, el pago y la recepción en el sistema de adquisiciones.</span></div>';
 if(['Cancelada','Rechazada'].includes(r.status))return '<div class="tracknote bad"><span>Solicitud '+r.status.toLowerCase()+'.</span></div>';
 return '<div class="tracknote'+(q?' wait':'')+'">'+icon(q?'chat':'info')+'<span>'+(q?'<b>Información pendiente de '+esc(q.to)+'</b> · '+esc(q.topic)+'. ':'')+'Etapa actual: <b>'+esc(cur?.label||'')+'</b> · Pendiente de: <b>'+esc(t.waiting)+'</b></span></div>';
}
function miniTrack(r){
 const t=stageInfo(r,params());
 return '<div class="minitrack"><span class="mini">'+t.stages.map(s=>'<i class="'+s.state+'"></i>').join('')+'</span><small>'+esc(isConcluded(r.status)?DONE:t.stages[t.cur]?.label||'')+'</small></div>';
}

/* ---------- Estructura ---------- */
function render(){renderCore();setTimeout(maybeGuide,0);}
function renderCore(){
 if(!user){$('#app').innerHTML='<main class="login"><section class="panel"><img src="logo.png" alt="ITM Group"><h1>Instrumentos de Compra</h1><p class="muted">Acceso para el área de Construcción</p><form id="login"><label>Correo electrónico<input required name="email" type="email" autocomplete="username"></label><label>Contraseña<input required name="password" type="password" autocomplete="current-password"></label><div id="error" class="error" role="alert"></div><button class="btn primary">Iniciar sesión</button></form></section></main>';return;}
 if(view==='print'){$('#app').innerHTML=printView();return;}
 const nav=navigation.filter(n=>has(...n[3]));
 const initials=user.name.split(' ').slice(0,2).map(s=>s[0]).join('');
 const lookup='<form id="lookup" class="tools"><input name="folio" aria-label="Buscar por folio" placeholder="Buscar folio…"></form>';
 const side=demo?'<div class="sidefoot"><label style="color:inherit">Ver la demo como'+select('demoRole',demoUsers.map((u,i)=>[i,u.label]),demoUsers.indexOf(user),'')+'</label><button type="button" class="btn ghost" data-action="resetDemo">'+icon('refresh')+'Reiniciar demo</button></div>':'';
 $('#app').innerHTML='<header class="top"><div class="brand">'+btn('Menú','menu','mobilemenu','menu')+'<img src="logo.png" alt="ITM Group"><strong>Instrumentos de Compra</strong></div><div class="tools">'+lookup+'<div class="identity"><div class="avatar">'+esc(initials)+'</div><div><b>'+esc(user.name)+'</b><small>'+esc(user.roles[0])+'</small></div></div>'+btn('Cómo usar','guide','','info')+(!demo?btn('Salir','logout','','logout'):'')+'</div></header><div class="layout"><aside class="'+(menu?'open':'')+'"><div><h2>Gestión de compras</h2><nav aria-label="Navegación">'+nav.filter(n=>n[0]!=='admin'&&n[0]!=='audit').map(navItem).join('')+'</nav></div>'+(nav.some(n=>n[0]==='admin')?'<div><h2>Configuración</h2><nav aria-label="Configuración">'+nav.filter(n=>n[0]==='admin'||n[0]==='audit').map(navItem).join('')+'</nav></div>':'')+side+'</aside><main id="content" class="main">'+content()+'</main></div>';
}
function navItem([id,label,ico]){return '<button data-action="nav:'+id+'" '+(view===id?'aria-current="page"':'')+'>'+icon(ico)+esc(label)+'</button>'}
const demoBanner=()=>demo?'<div class="demo">'+icon('info')+'<div><b>Demo con datos ficticios · '+esc(user.roles[0])+'.</b> '+esc(demoTips[user.roles[0]]||'')+' Usa «Ver la demo como» (menú lateral) para cambiar de perfil.</div></div>':'';
const notices=()=>state.notices??[];
const fmtV=v=>v==null?'—':Number(v).toLocaleString('es-MX');
const noticeBanner=()=>has('Legal')?notices().filter(n=>n.to==='Legal'&&!n.read).map(n=>'<div class="tracknote wait">'+icon('info')+'<span><b>Aviso: Compras cambió los parámetros de evaluación</b> ('+when(n.at)+'). '+n.changes.map(c=>esc(c.label)+': '+fmtV(c.from)+' → <b>'+fmtV(c.to)+'</b>').join(' · ')+'</span>'+btn('Enterado','notice:'+n.id,'primary','check')+'</div>').join(''):'';
function content(){
 const nb=(view==='wizard'||view==='detail')?'':noticeBanner();
 return nb+contentInner();
}
function contentInner(){
 if(view==='wizard')return wizardView();
 if(view==='detail')return detailView();
 if(view==='admin')return adminView();
 if(view==='providers')return providerView();
 if(view==='audit')return auditView();
 if(view==='dashboard')return dashboard();
 if(view==='mine')return mineView();
 if(view==='purchases'||view==='legalq')return bandejaView(view);
 const map={reviews:['Revisión especializada','Consulta las tareas y documenta los controles aplicables.'],approvals:['Autorizaciones','Revisa las solicitudes listas para decisión de Dirección de Obra.']};
 const [h,p]=map[view]??map.reviews;
 let rows=available().filter(r=>view==='reviews'?r.tasks?.some(t=>!t.done&&(has(t.role)||has('Administrador'))):view==='approvals'?r.status==='Pendiente de autorización':!!r.folio);
 return title(h,p,btn('Exportar CSV','export','','down'))+filters()+panel(h,table(filtered(rows)));
}
function filters(){
 const p=params(), make=(name,label,choices)=>'<label>'+label+select(name,choices,filter[name],'Todos')+'</label>';
 return '<form class="filters" id="filters">'+make('work','Obra / UDN',Object.entries(p.works))+make('type','Tipo de compra',maps(p.types))+make('level','Instrumento',maps(instruments).slice(1))+make('status','Estado',[...new Set(available().map(r=>r.status))].sort().map(v=>[v,statusText(v)]))+'<details><summary class="btn">Más filtros</summary><div class="formgrid group"><label>Desde<input type="date" name="from" value="'+esc(filter.from)+'"></label><label>Hasta<input type="date" name="to" value="'+esc(filter.to)+'"></label>'+make('provider','Proveedor',state.providers.map(v=>[v.tax,v.name]))+'</div></details>'+btn('Limpiar','reset')+'</form>';
}
function filtered(rows){
 return rows.filter(r=>(!filter.work||r.work===filter.work)&&(!filter.type||String(r.type)===filter.type)&&(!filter.level||String(lvlOf(r))===filter.level)&&(!filter.status||r.status===filter.status)&&(!filter.provider||r.tax===filter.provider)&&(!filter.from||(r.sentAt??r.createdAt??'').slice(0,10)>=filter.from)&&(!filter.to||(r.sentAt??r.createdAt??'').slice(0,10)<=filter.to));
}
const cols={
 folio:['Folio',r=>actionText(r.folio||'Borrador','detail:'+r.id)],
 desc:['Solicitud',r=>'<b>'+esc(r.description||'Sin descripción')+'</b><small class="sub">'+esc(r.provider||'Proveedor por definir')+' · '+esc(who(r.owner))+'</small>'],
 provider:['Proveedor',r=>esc(r.provider||'—')],
 amount:['Monto USD',r=>'<b>'+money(r.amount||0)+'</b>'],
 inst:['Instrumento',r=>inst(lvlOf(r))+(r.folio&&!r.finalLevel?' <span class="tag">Por confirmar</span>':'')],
 risk:['Riesgo',r=>risk(r.evaluation?.risk)],
 track:['Avance',r=>r.folio?miniTrack(r):'—'],
 todo:['Tu acción',r=>action(r)?badge(action(r),'amber'):partDone(r)?badge(partDone(r),'green','check'):'<span class="muted">—</span>'],
 scope:['Tu alcance',r=>legalOwns(r)?badge('Puedes modificar','green'):badge('Solo consulta','')],
 status:['Estado',r=>status(r)],
 date:['Fecha',r=>date(r.sentAt??r.createdAt)]
};
function table(rows,keys=['folio','desc','amount','inst','risk','status','date'],limit=8){
 if(!rows.length)return '<div class="empty">No hay solicitudes que coincidan con los filtros.</div>';
 return '<div class="tablewrap"><table class="table"><thead><tr>'+keys.map(k=>'<th scope="col">'+cols[k][0]+'</th>').join('')+'</tr></thead><tbody>'+rows.slice((page-1)*limit,page*limit).map(r=>'<tr'+(action(r)?' class="attn"':'')+'>'+keys.map(k=>'<td>'+cols[k][1](r)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(rows.length>limit?'<div class="wizardfoot"><small>Página '+page+' de '+Math.ceil(rows.length/limit)+'</small><div>'+ (page>1?btn('Anterior','prevpage'):'')+(page*limit<rows.length?btn('Siguiente','nextpage'):'')+'</div></div>':'');
}

/* ---------- Solicitante ---------- */
function mineView(){
 const rows=available().filter(r=>r.owner===user.email).sort((a,b)=>(!!action(b))-(!!action(a))||String(b.sentAt??b.createdAt).localeCompare(String(a.sentAt??a.createdAt)));
 const todo=rows.filter(r=>action(r)),active=rows.filter(r=>r.folio&&!closed(r)),done=rows.filter(r=>isConcluded(r.status));
 const card=r=>'<article class="reqcard'+(action(r)?' attn':'')+'"><div class="reqtop"><div>'+actionText(r.folio||'Borrador',r.folio?'detail:'+r.id:'edit:'+r.id)+'<h3>'+esc(r.description||'Sin descripción')+'</h3><p class="muted">'+esc(r.provider||'Proveedor por definir')+' · '+money(r.amount||0)+' USD · '+date(r.sentAt??r.createdAt)+'</p></div><div class="reqbadges">'+(r.folio?status(r)+inst(lvlOf(r)):badge('Borrador'))+'</div></div>'+(r.folio?tracker(r,'compact')+trackNote(r):'<p class="muted">Aún no se ha enviado a Compras.</p>')+'<div class="reqfoot">'+(action(r)?badge(action(r),'amber','chat'):'<span></span>')+btn(r.folio?'Ver detalle':'Continuar borrador',r.folio?'detail:'+r.id:'edit:'+r.id,action(r)?'primary':'')+'</div></article>';
 return title('Mis solicitudes','Consulta en qué etapa va cada solicitud y qué sigue.',btn('Nueva solicitud','new','primary','plus'),'Solicitante')+demoBanner()+
 '<div class="cards three">'+metric('En proceso',active.length,'Solicitudes activas','file')+metric('Requieren tu respuesta',todo.length,'Compras o Legal esperan algo de ti','chat',todo.length?'warning':'')+metric('Análisis concluidos',done.length,'Compras ya continúa con la requisición','check')+'</div>'+
 (rows.length?'<div class="reqlist">'+rows.map(card).join('')+'</div>':panel('Sin solicitudes','<div class="empty">Todavía no has creado solicitudes. Usa «Nueva solicitud» para empezar.</div>'));
}

/* ---------- Compras y Legal ---------- */
function bandejaView(kind){
 const base=available().filter(r=>r.folio);
 const chips=kind==='purchases'
  ?[['all','Todas',()=>true],['todo','Por atender',r=>!!action(r)],['os','Orden de Servicio · sin contrato',r=>lvlOf(r)===1],['basic','Contrato Marco',r=>lvlOf(r)===2],['formal','Contrato formal',r=>lvlOf(r)===3],['done','Análisis concluido',r=>isConcluded(r.status)]]
  :[['all','Todas',()=>true],['todo','Por atender',r=>!!action(r)],['own','Requieren contrato',r=>legalOwns(r)],['mine','Mi parte terminada',r=>legalOwns(r)&&legalDone(r)],['view','Solo consulta',r=>!legalOwns(r)]];
 const current=chips.find(c=>c[0]===chip)??chips[0];
 const rows=filtered(base.filter(current[2])).sort((a,b)=>(!!action(b))-(!!action(a)));
 const keys=kind==='purchases'?['folio','desc','amount','inst','risk','track','todo']:['folio','desc','amount','inst','risk','track','scope','todo'];
 const chipsHtml='<div class="chips" role="tablist">'+chips.map(([id,label,fn])=>'<button type="button" class="chip'+(id===current[0]?' active':'')+'" data-action="chip:'+id+'">'+esc(label)+'<b>'+base.filter(fn).length+'</b></button>').join('')+'</div>';
 const [h,p]=kind==='purchases'?['Bandeja de Compras','Ves todas las solicitudes. Clasifícalas por instrumento, pide información al solicitante y da seguimiento hasta el cierre.']:['Bandeja de Legal','Ves todas las solicitudes. Solo puedes modificar las que requieren contrato; el resto es de consulta.'];
 return title(h,p,btn('Exportar CSV','export','','down'),kind==='purchases'?'Compras':'Legal')+demoBanner()+chipsHtml+'<details class="filterbox"><summary class="btn">'+icon('grid')+'Filtros</summary>'+filters()+'</details>'+panel(current[1],table(rows,keys,10));
}

/* ---------- Indicadores ---------- */
function dashboard(){
 const rows=filtered(available().filter(r=>r.folio)), active=rows.filter(r=>!['Cancelada','Rechazada'].includes(r.status));
 const levels=[1,2,3].map(i=>rows.filter(r=>lvlOf(r)===i).length);
 const nature=['Cuantitativa','Cualitativa'].map(n=>rows.filter(r=>params().nature[r.type]===n));
 const blocked=rows.filter(r=>r.status.startsWith('Bloqueada'));
 const avoided=rows.filter(r=>lvlOf(r)===1&&r.evaluation.amount>r.evaluation.params.current);
 const colors=['#2e9e5b','#d9970b','#d64545'], total=levels.reduce((a,b)=>a+b,0), percent=n=>total?n*100/total:0;
 const ring=total?'conic-gradient('+colors[0]+' 0 '+percent(levels[0])+'%, '+colors[1]+' '+percent(levels[0])+'% '+percent(levels[0]+levels[1])+'%, '+colors[2]+' '+percent(levels[0]+levels[1])+'% 100%)':'#edf0f6';
 const bar=(label,n,all,color)=>'<div><div class="barlabel">'+label+'<b>'+n+'</b></div><div class="bar"><span style="width:'+(all?n*100/all:0)+'%;background:'+color+'"></span></div></div>';
 return title('Indicadores de compras','Consulta el estado de las solicitudes de Construcción y los instrumentos asignados.',btn('Exportar CSV','export','','down')+(has('Solicitante')?btn('Nueva solicitud','new','primary','plus'):''))+demoBanner()+
 filters()+'<div class="cards">'+metric('Solicitudes registradas',rows.length,'Con folio asignado','file')+metric('Monto comprometido',money(active.reduce((s,r)=>s+r.amount,0)),'USD · solicitudes activas','cash')+metric('Contratos evitados',avoided.length,'Órdenes de Servicio sobre el tope vigente','check')+metric('Revisión pendiente',blocked.length,params().reduced?'En revisión de Legal':'Bloqueadas por revisión especializada','lock','warning')+'</div>'+
 '<div class="charts">'+panel('Distribución por instrumento','<div class="chartbody"><div class="ring" style="background:'+ring+'" aria-hidden="true"><span>'+total+'<small>solicitudes</small></span></div><div class="legend">'+levels.map((n,i)=>'<div><span class="dot" style="background:'+colors[i]+'"></span>'+instruments[i+1]+'<b>'+n+'</b></div>').join('')+'</div></div>','Instrumento vigente por solicitud')+
 panel('Naturaleza de la compra','<div class="barset">'+nature.map((items,i)=>bar(['Cuantitativa','Cualitativa'][i],items.length,rows.length,['#0068d6','#657fbf'][i])+'<div class="hint">'+money(items.reduce((s,r)=>s+r.amount,0))+' USD</div>').join('')+'</div>','Solicitudes y monto por tipo de adquisición')+'</div>'+
 panel('Solicitudes recientes',table(rows,['folio','desc','amount','inst','risk','status','date']),'Abre un folio para consultar su evaluación y seguimiento.')+
 '<div class="charts group">'+panel('Distribución de riesgo','<div class="barset">'+['BAJO','MEDIO','ALTO'].map((r,i)=>bar(r,rows.filter(x=>x.evaluation.risk===r).length,rows.length,colors[i])).join('')+'</div>')+
 panel('Alertas de acumulado',rows.some(r=>r.evaluation.alert)?'<ul class="timeline">'+rows.filter(r=>r.evaluation.alert).map(r=>'<li><b>'+esc(r.folio)+' · '+esc(r.provider)+'</b><time>'+money(r.evaluation.amount)+' USD evaluados'+(r.evaluation.fragmentation?' · Posible fragmentación':'')+'</time></li>').join('')+'</ul>':'<p class="muted">Sin alertas para los filtros seleccionados.</p>')+'</div>';
}

/* ---------- Nueva solicitud ---------- */
function field(name,label,type='text',wide=false,help=''){return '<label class="'+(wide?'wide':'')+'">'+label+(type==='textarea'?'<textarea name="'+name+'">'+esc(wizard[name])+'</textarea>':'<input name="'+name+'" type="'+type+'" value="'+esc(wizard[name])+'" '+(type==='number'?'step="any" min="0"':'')+'>')+hint(help)+'</label>'}
const yesNo=(name,v,guide=false)=>select(name,[['Sí','Sí'],['No','No'],...(guide?[['No sé','No sé']]:[])],guide?v:v===true?'Sí':v===false?'No':'');
function question(key,min){
 const [label,...anchors]=params().questions[key],v=wizard.scores?.[key];
 const suggest=params().profiles[wizard.type]?.[Number(key[1])-1];
 return '<div class="question"><label>'+esc(label)+select('score:'+key,anchors.map((a,i)=>[i,a]).slice(min),v)+'</label>'+(key.startsWith('O')&&suggest!=null?'<div class="hint">Sugerencia para este tipo de compra: '+esc(anchors[suggest])+'</div>':'')+(v>0?'<label>Justificación breve (puedes ajustarla)<input type="text" name="evidence:'+key+'" value="'+esc(wizard.evidence?.[key])+'"></label>':'')+'</div>';
}
const qDone=k=>{const d=wizard,v=d.scores?.[k];return Number.isInteger(v)&&(v===0||!!d.evidence?.[k]?.trim());};
const guideDone=i=>{const g=wizard.guide[i];return g==='No'||(g==='Sí'&&groups[i].every(k=>qDone(k)&&wizard.scores[k]>=1));};
function blocks(){
 const g=params().guides,guide=i=>{const [id,q]=Object.entries(g)[i];return '<div class="question"><label>'+esc(q)+yesNo('guide:'+i,wizard.guide[i],true)+'</label>'+(wizard.guide[i]==='Sí'?groups[i].map(k=>question(k,1)).join(''):wizard.guide[i]==='No sé'?'<p class="hint">Aclara esta respuesta con tu responsable para poder enviar.</p>':'')+'</div>';};
 return [
  {t:'Operación y dependencia',s:'Qué tan importante es este proveedor para la obra',done:['O1','O2','O3'].every(qDone),body:['O1','O2','O3'].map(k=>question(k,0)).join('')},
  {t:'Tecnología e información',s:'Accesos a sistemas, datos y software',done:[0,1].every(guideDone),body:[0,1].map(guide).join('')},
  {t:'Personal, permisos y contratos',s:'Personal en sitio, regulación y condiciones especiales',done:[2,3,4].every(guideDone),body:[2,3,4].map(guide).join('')},
  {t:'Condiciones económicas',s:'Anticipos, garantías y penalizaciones',done:[5,6].every(guideDone),body:[5,6].map(guide).join('')}
 ];
}
function wizardView(){
 const p=params(),d=wizard;
 d.triggers=deriveTriggers(d);
 const prev=previewPrevious??accumulate(available(),d,p);
 const result=evaluate(d,p,prev);
 const steps=['Datos de compra','Filtros de Legal','Evaluación de riesgo','Resumen y resultado'];
 const kind=d.providerKind,catalog=state.providers.filter(x=>x.status!=='Bloqueado');
 const providerFields='<label>¿El proveedor ya está registrado?'+select('providerKind',[['existing','Sí, ya está registrado'],['new','No, es un proveedor nuevo']],kind)+hint('Si no estás seguro, búscalo en la lista. Si no aparece, elige proveedor nuevo.')+'</label>'+
  (kind==='existing'?'<label>Nombre del proveedor'+select('providerChoice',catalog.map(x=>[x.tax,x.name]),d.tax)+hint(d.tax?'RFC / ID fiscal: '+d.tax:'Selecciona al proveedor de la lista.')+'</label>':kind==='new'?field('provider','Razón social','text',false,'Nombre legal completo del proveedor, como aparece en su cotización.')+field('tax','RFC / ID fiscal','text',false,'Para proveedores extranjeros, escribe su ID fiscal. Compras validará el alta.'):'');
 const form1='<div class="formgrid"><label>Obra / UDN'+select('work',Object.entries(p.works),d.work)+'</label><label>Tipo de compra'+select('type',maps(p.types),d.type)+'</label>'+field('description','Descripción y alcance','textarea',true,'Qué se va a comprar o contratar y para qué parte de la obra. Ej.: varilla del #4 para la losa del nivel 2.')+field('quantity','Cantidad','number',false,'Cuánto se necesita.')+field('unit','Unidad',  'text',false,'Piezas, m³, servicio, meses…')+field('amount','Monto total estimado (USD)','number',false,'Monto de toda la compra o contrato, en dólares.')+field('budgetLine','Partida presupuestal (opcional)','text',false,'Si la conoces, anótala.')+field('start','Inicio de vigencia','date',false,'Fecha en que el proveedor empieza a entregar el material o a prestar el servicio.')+field('end','Fin de vigencia','date',false,'Fecha en que termina la entrega o el servicio. Si es una compra única, usa la fecha de la última entrega.')+field('required','Fecha requerida','date',false,'Fecha límite en que necesitas el material o servicio en obra. Compras la usa para priorizar.')+'<div class="wide divider"><b>Proveedor</b></div>'+providerFields+'<label class="wide">Cotización obligatoria<input type="file" name="quote" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"><small class="hint">'+esc(d.file?.name||'PDF, JPG, PNG, XLSX o DOCX · hasta 10 MB')+'</small></label></div>';
 const form2='<p class="muted">Responde Sí o No. Legal usa estas respuestas para saber si la compra necesita una revisión adicional.</p>'+p.exclusions.map((q,i)=>p.active[i]?'<div class="question"><label>'+esc(q)+yesNo('x:'+i,d.x[i])+'</label>'+(p.prefill[d.type]===i?'<p class="hint">Por el tipo de compra, lo más probable es que la respuesta sea Sí. Confírmalo.</p>':'')+'</div>':'').join('');
 const bl=blocks(),doneCount=bl.filter(b=>b.done).length;
 const form3='<div class="progress"><div class="progressbar"><span style="width:'+doneCount*25+'%"></span></div><small>'+doneCount+' de 4 bloques completos · Responde por bloque, no tienes que hacerlo de una vez.</small></div>'+bl.map((b,i)=>'<section class="block'+(blk===i?' open':'')+'"><button type="button" class="blockhead" data-action="blk:'+i+'" aria-expanded="'+(blk===i)+'"><span class="bnum'+(b.done?' ok':'')+'">'+(b.done?icon('check'):i+1)+'</span><span class="btitle"><b>'+b.t+'</b><small>'+b.s+'</small></span>'+badge(b.done?'Completo':'Pendiente',b.done?'green':'amber')+'</button>'+(blk===i?'<div class="blockbody">'+b.body+'<div class="blockfoot">'+(i<3?btn('Siguiente bloque','blk:'+(i+1),'primary'):'')+'</div></div>':'')+'</section>').join('');
 const form4=result.level?resultSimple(result,d):'<div class="empty">Evaluación pendiente. Completa los bloques de la etapa anterior para ver el resultado.</div>';
 return title('Nueva solicitud','Registra los datos y evalúa la exposición de la compra.',demo?btn('Cargar ejemplo de varilla','example'):'','Solicitante')+'<div class="wizard"><div class="steps" aria-label="Avance de la solicitud">'+steps.map((s,i)=>'<div class="step '+(i===step?'active':'')+'" '+(i===step?'aria-current="step"':'')+'>'+(i+1)+'. '+s+'</div>').join('')+'</div>'+panel(steps[step],'<form id="wizard">'+[form1,form2,form3,form4][step]+'</form><div class="error" role="alert" id="error"></div><div class="wizardfoot">'+btn(step?'Anterior':'Volver','backstep')+'<div class="actions">'+btn('Guardar borrador','save')+(step<3?btn('Continuar','nextstep','primary'):btn('Enviar a Compras','send','primary'))+'</div></div>')+'</div>';
}
function dataPairs(pairs){return '<dl class="summarygrid">'+pairs.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>'}
const nextText=['','Es una Orden de Servicio: no requiere contrato. Compras confirmará el instrumento y continuará con la requisición.','Requiere contrato marco. Compras lo gestionará con el proveedor antes de adquirir.','Requiere contrato formal. Legal lo elaborará y Compras podría pedirte información adicional.'];
function resultSimple(r,d,short=false){
 return '<div class="resultcard l'+r.level+'"><div><small>Resultado del análisis</small><h3>'+esc(instruments[r.level])+'</h3><p>'+esc(nextText[r.level])+'</p></div><div class="resultmeta">'+risk(r.risk)+(r.blocked?badge('Pasará por revisión de Legal','','lock'):'')+'</div></div>'+(short?'':dataPairs([['Compra',esc(d.description)],['Monto',money(d.amount)+' USD'],['Proveedor',esc(d.provider||'—')+(d.providerKind==='new'?' · '+badge('Nuevo','blue'):'')],['Vigencia',esc(d.start+' a '+d.end)]])+'<p class="muted">Al enviar, Compras recibe tu solicitud con su folio. El detalle del análisis lo revisa el equipo de Compras.</p>');
}
function resultView(r,d){
 const p=r.params??params();
 return dataPairs([['Monto de la solicitud',money(d.amount)+' USD'],['Acumulado anterior',money(r.previous)+' USD'],['Monto evaluado',money(r.amount)+' USD'],['Instrumento sugerido',inst(r.level)],['Riesgo de la relación',risk(r.risk)],['Puntaje',r.total+' / 12']])+'<p><b>'+esc(r.rule)+'</b></p><p class="muted">'+esc(p.recommendations[r.level])+'</p>'+(r.blocked?'<p>'+badge('Revisión especializada requerida','','lock')+'</p>':'')+(r.alert?'<p>'+badge(r.fragmentation?'Posible fragmentación · acumulado sobre el tope':'Alerta de acumulado','amber')+'</p>':'')+(r.warnings?.length?'<ul>'+r.warnings.map(i=>'<li>Revisa si aplica este disparador: '+esc(p.triggers[i][0])+'</li>').join('')+'</ul>':'');
}
function evaluationTable(r){
 const p=r.params??params();
 return '<div class="tablewrap group"><table class="table" style="white-space:normal"><thead><tr><th>Pregunta</th><th>Puntaje</th><th>Evidencia</th></tr></thead><tbody>'+Object.entries(p.questions).map(([k,q])=>'<tr><td>'+esc(q[0])+'</td><td>'+esc(r.scores[k]??'—')+'</td><td>'+esc(r.evidence[k]??'Pendiente')+'</td></tr>').join('')+'</tbody></table></div>';
}

/* ---------- Detalle ---------- */
function infoTab(r){
 const reqs=(r.requests??[]).slice().reverse();
 const asks=!closed(r)?(has('Compras')?btn('Pedir información al solicitante','ask:Solicitante','primary','chat'):has('Legal')&&legalOwns(r)?btn('Pedir información a Compras','ask:Compras','primary','chat'):''):'';
 const card=q=>{
  const mineQ=q.status==='Abierta'&&(q.to==='Solicitante'?r.owner===user.email&&has('Solicitante'):has(q.to));
  return '<div class="question req'+(q.status==='Abierta'?' open':'')+'"><div class="panelheader"><div><b>'+esc(q.topic)+'</b><p class="muted">'+esc(q.from)+' → '+esc(q.to)+' · '+when(q.at)+'</p></div>'+badge(q.status==='Abierta'?'Pendiente de '+q.to:q.status==='Respondida'?'Respondida':'Atendida',q.status==='Abierta'?'amber':'green')+'</div><p>'+esc(q.text)+'</p>'+(q.answer?'<div class="answer"><small>Respuesta · '+esc(who(q.answeredBy))+' · '+when(q.answeredAt)+'</small><p>'+esc(q.answer)+'</p></div>':'')+(mineQ?btn('Responder','answer:'+q.id,'primary','chat'):'')+(q.status==='Respondida'&&has(q.from)?btn('Enterado, continuar','ack:'+q.id,'','check'):'')+'</div>';
 };
 return (asks?'<div class="actions group0">'+asks+'</div>':'')+(reqs.length?reqs.map(card).join(''):'<p class="muted">Aún no hay solicitudes de información en este folio.'+(has('Compras')?' Úsalas para pedir datos del proveedor, del contrato o aclaraciones al solicitante.':'')+'</p>');
}
function actionBar(r){
 if(closed(r))return '';
 const b=[],lvl=lvlOf(r),own=legalOwns(r),prov=state.providers.find(x=>x.tax===r.tax);
 const n=mineReq(r).length;
 if(n)b.push(btn('Responder información ('+n+')','tab:info','primary','chat'));
 if(unacked(r).length)b.push(btn('Revisar respuesta recibida','tab:info','primary','chat'));
 if(has('Compras')){
  if(!r.authorization)b.push(btn(r.finalLevel?'Ajustar instrumento':'Confirmar instrumento','instrument',r.finalLevel?'':'primary','check'));
  b.push(btn('Pedir información al solicitante','ask:Solicitante','','chat'));
  if(!own&&lvl<3)b.push(btn('Enviar a revisión de Legal','legalReview','','scale'));
  if(prov&&prov.status!=='Activo')b.push(btn('Validar y activar proveedor','provider:'+prov.tax,'','users'));
  if(['En análisis de Compras','En formalización'].includes(r.status)&&r.finalLevel){
   if(!r.format)b.push(btn('Imprimir formato de análisis','print','primary','print'));
   b.push(btn(params().authorization===false?'Concluir análisis':'Enviar a autorización','advance',r.format?'primary':'','check'));
  }
  b.push(btn('Cancelar solicitud','cancel'));
 }
 if(has('Legal')&&own){
  b.push(btn('Pedir información a Compras','ask:Compras','','chat'));
  b.push(btn('Ajustar instrumento','instrument','','check'));
 }
 if(has('Dirección de Obra')&&r.status==='Pendiente de autorización')b.push(btn('Registrar decisión','authorize','primary'));
 if(has('Legal')&&!own)return '<div class="tracknote">'+icon('info')+'<span>Esta solicitud no requiere contrato: tienes acceso de <b>solo consulta</b>.</span></div>';
 return b.length?'<div class="actionbar">'+b.join('')+'</div>':'';
}
function detailView(){
 const r=available().find(r=>r.id===selected);
 if(!r)return title('Solicitud no disponible','Consulta los folios disponibles para tu perfil.',btn('Volver','home'));
 if(!r.folio)return title(r.description||'Borrador','Continúa con el registro de la compra.',btn('Editar borrador','edit:'+r.id,'primary'));
 const e=r.evaluation,p=e.params,full=has('Compras','Administrador');
 const tabs=[['sum','Resumen'],...(full?[['eval','Evaluación']]:[]),['info','Información'+(r.requests?.length?' ('+r.requests.length+')':'')],...(has('Compras','Legal','Administrador')?[['rev','Revisiones y contrato']]:[]),['docs','Documentos'],['hist','Historial'],['buy','Formato']];
 if(!tabs.some(([id])=>id===tab))tab='sum';
 const prov=state.providers.find(x=>x.tax===r.tax);
 const audit='<ul class="timeline">'+r.history.slice().reverse().map(h=>'<li><b>'+esc(h.action)+'</b><time>'+when(h.at)+' · '+esc(who(h.user))+'</time>'+esc(h.comment)+'</li>').join('')+'</ul>';
 const review=r.tasks.length?r.tasks.map(t=>'<div class="question"><div class="panelheader"><div><b>'+esc(t.label)+'</b><p class="muted">'+esc(t.role)+' · '+esc(t.evidence)+'</p></div>'+badge(t.done?'Atendida':'Pendiente',t.done?'green':'amber')+'</div>'+(t.done?'<p class="muted">'+esc(t.comment)+' · '+esc(who(t.user))+'</p>':has(t.role)?btn(t.id==='legal'?'Marcar contrato listo':'Marcar atendida','review:'+t.id,'primary'):'<p class="muted">En espera de '+esc(t.role)+'.</p>')+'</div>').join(''):'<p class="muted">No hay revisiones asignadas.</p>';
 const buy='<div class="question"><div class="panelheader"><div><b>Formato de análisis de instrumento de compra</b><p class="muted">Lo imprime Compras y se anexa a la requisición. Sin este formato no se puede concluir el análisis ni continuar con la compra.</p></div>'+(r.format?badge('Generado '+date(r.format.at),'green','check'):badge('Pendiente','amber'))+'</div>'+(has('Compras')?btn(r.format?'Volver a imprimir':'Generar e imprimir formato','print','','print'):'<p class="muted">Lo genera Compras y se anexa a la requisición.</p>')+'</div><div class="tracknote">'+icon('info')+'<span>Este sistema termina con el análisis. La requisición, la orden de compra, el pago y la recepción se llevan en el sistema de adquisiciones.</span></div>';
 const details=dataPairs([['Solicitante',esc(who(r.owner))],['Obra / UDN',esc(p.works[r.work])],['Tipo de compra',esc(p.types[r.type])],['Descripción',esc(r.description)],['Monto estimado',money(r.amount)+' USD'],['Proveedor',esc(r.provider)+(prov&&prov.status!=='Activo'?' '+badge(prov.status,'amber'):'')],['RFC / ID fiscal',esc(r.tax)],['Instrumento vigente',inst(lvlOf(r))],['Estado',status(r)],['Fecha requerida',esc(r.required)],['Vigencia',esc(r.start+' a '+r.end)]]);
 const content={sum:details+resultSimple(e,r,true),eval:resultView(e,r)+evaluationTable(e),info:infoTab(r),rev:review,docs:r.file?'<p>'+esc(r.file.name)+'</p>'+(!demo?'<a class="btn" href="/api/file?id='+encodeURIComponent(r.id)+'">Descargar cotización</a>':''):'<p class="muted">Sin cotización adjunta.</p>',hist:audit,buy};
 return title(r.folio,r.description,btn('Volver','home')+(has('Compras')?btn('Imprimir formato','print','primary','print'):''))+panel('Seguimiento de la solicitud',tracker(r)+trackNote(r))+myPart(r)+actionBar(r)+'<div class="tabs" aria-label="Secciones de la solicitud">'+tabs.map(([id,t])=>'<button class="tab '+(id===tab?'active':'')+'" data-action="tab:'+id+'" '+(id===tab?'aria-current="true"':'')+'>'+t+'</button>').join('')+'</div>'+panel(tabs.find(([id])=>id===tab)[1],content[tab]);
}

/* ---------- Formato imprimible ---------- */
function printView(){
 const r=available().find(x=>x.id===selected);
 if(!r)return '<main class="main">'+title('Formato no disponible','',btn('Volver','printback'))+'</main>';
 const e=r.evaluation,p=e.params,lvl=lvlOf(r),full=has('Compras','Administrador'),prov=state.providers.find(x=>x.tax===r.tax);
 const tbl=pairs=>'<table class="pf"><tbody>'+pairs.map(([k,v])=>'<tr><th>'+esc(k)+'</th><td>'+v+'</td></tr>').join('')+'</tbody></table>';
 const contract=lvl>=2||(r.tasks??[]).some(t=>t.role==='Legal');
 const legalDone=(r.tasks??[]).filter(t=>t.role==='Legal').every(t=>t.done);
 const check=(label,ok,extra='')=>[label,(ok?'☑ Sí':'☐ Pendiente')+(extra?' · '+esc(extra):'')];
 const sign=['Solicitante','Compras',...(contract?['Legal']:[])];
 return '<div class="noprint printbar"><div><b>Formato de análisis de instrumento de compra</b><span>Usa el botón o Ctrl/Cmd + P para imprimir o guardar como PDF. Anéxalo a la requisición de compra.</span></div><div class="actions">'+btn('Volver','printback')+btn('Imprimir / guardar PDF','doPrint','primary','print')+'</div></div>'+
 '<article class="sheet"><header class="sheethead"><img src="logo.png" alt="ITM Group"><div><h1>Formato de análisis de instrumento de compra</h1><p>Área de Construcción · Folio <b>'+esc(r.folio)+'</b></p></div><div class="sheetmeta"><div>Emitido: '+when(new Date().toISOString())+'</div><div>Estado: '+esc(statusText(r.status))+'</div></div></header>'+
 '<section><h2>1. Datos de la solicitud</h2>'+tbl([['Solicitante',esc(who(r.owner))],['Obra / UDN',esc(p.works[r.work])],['Tipo de compra',esc(p.types[r.type])],['Descripción',esc(r.description)],['Cantidad',esc(r.quantity+' '+r.unit)],['Monto estimado',money(r.amount)+' USD'],['Vigencia',esc(r.start+' a '+r.end)],['Fecha requerida',esc(r.required)],['Fecha de la solicitud',date(r.sentAt)]])+'</section>'+
 '<section><h2>2. Proveedor</h2>'+tbl([['Razón social',esc(r.provider)],['RFC / ID fiscal',esc(r.tax)],['Alta de proveedor',esc(prov?.status||'—')]])+'</section>'+
 '<section><h2>3. Resultado del análisis</h2><div class="resultbox l'+lvl+'"><b>'+esc(instruments[lvl])+'</b><span>'+esc(nextText[lvl])+'</span></div>'+tbl([['Nivel de riesgo',esc(e.risk)],['Instrumento confirmado por Compras',r.finalLevel?esc(instruments[r.finalLevel]):'Pendiente de confirmar'],['Revisión de Legal',contract?'Requerida':'No requerida']])+'</section>'+
 '<section><h2>4. Control previo a la adquisición</h2>'+tbl([check('Instrumento confirmado por Compras',!!r.finalLevel),...(contract?[check('Contrato / revisión de Legal concluido',legalDone)]:[]),check('Proveedor activo en catálogo',prov?.status==='Activo'),check('Sin solicitudes de información abiertas',!openReq(r).length)])+'</section>'+
 '<p class="sheetnote"><b>Este formato debe anexarse a la requisición de compra.</b> Sin él, el equipo de Compras no puede gestionar la adquisición.</p>'+
 '<section class="signs">'+sign.map(s=>'<div><span></span>'+s+'<small>Nombre, firma y fecha</small></div>').join('')+'</section>'+
 (demo?'<p class="sheetdemo">Documento generado por la demo del sistema Instrumentos de Compra · datos ficticios</p>':'')+
 (full?'<section class="annex"><h2>Anexo (uso interno de Compras) · Detalle de la evaluación</h2>'+tbl([['Puntaje total',e.total+' / 12'],['Regla aplicada',esc(e.rule)],['Monto evaluado (con acumulado)',money(e.amount)+' USD'],['Acumulado previo',money(e.previous)+' USD']])+evaluationTable(e)+'</section>':'')+'</article>';
}

/* ---------- Otras vistas ---------- */
function providerView(){
 return title('Proveedores','Administra los datos fiscales y el estado de alta.',btn('Registrar proveedor','provider','primary','plus'))+panel('Catálogo de proveedores','<div class="tablewrap"><table class="table"><thead><tr><th>Razón social</th><th>RFC / ID fiscal</th><th>Contacto</th><th>Estado</th></tr></thead><tbody>'+state.providers.map(p=>'<tr><td>'+actionText(p.name,'provider:'+p.tax)+'</td><td>'+esc(p.tax)+'</td><td>'+esc(p.contact||p.email||'—')+'</td><td>'+badge(p.status,p.status==='Activo'?'green':'amber')+'</td></tr>').join('')+'</tbody></table></div>');
}
function adminView(){
 const p=params();
 if(!has('Administrador')){
  const inp=(name,label,value)=>'<label>'+label+'<input name="'+name+'" type="number" step="any" value="'+esc(value??'')+'"></label>';
  const hist=notices().slice().reverse().map(n=>'<li><b>Versión '+n.version+'</b><time>'+when(n.at)+' · '+esc(who(n.by))+'</time>'+n.changes.map(c=>esc(c.label)+': '+fmtV(c.from)+' → '+fmtV(c.to)).join(' · ')+' · '+(n.read?badge('Legal enterado '+date(n.read.at),'green','check'):badge('Legal sin leer','amber'))+'</li>').join('');
  return title('Parámetros de evaluación','Topes, bandas y ventana de acumulado. Cada cambio genera un aviso a Legal.','')+'<div class="tracknote wait">'+icon('info')+'<span><b>Valores en revisión (propuesta).</b> El tope ampliado de 25,000 USD es una propuesta de Legal y las bandas de riesgo económico (E1) se validan con Finanzas. Puedes ajustarlos aquí.</span></div>'+panel('Valores · versión '+p.version,'<form id="params"><div class="formgrid">'+inp('current','Tope vigente de Orden de Servicio (USD)',p.current)+inp('expanded','Tope ampliado · propuesta de Legal (USD)',p.expanded)+inp('band1','Banda E1 · puntaje 1 hasta (USD) · por validar',p.bands[0])+inp('band2','Banda E1 · puntaje 2 hasta (USD) · por validar',p.bands[1])+inp('months','Ventana de acumulado (meses)',p.months)+inp('alert','Alerta al llegar al % del tope ampliado',p.alert)+'</div><div class="error" id="error" role="alert"></div><button class="btn primary">Guardar y avisar a Legal</button></form>')+'<div class="group">'+panel('Cambios anteriores',hist?'<ul class="timeline">'+hist+'</ul>':'<p class="muted">Aún no hay cambios registrados.</p>')+'</div>';
 }
 const input=(name,label,value)=>'<label>'+label+'<input name="'+name+'" type="number" step="any" value="'+esc(value)+'"></label>';
 const checks=[['applyBelow','Aplicar exclusiones debajo del tope vigente'],['budget','Exigir validación presupuestal'],['notify','Avisar si falta marcar un disparador']];
 const complex=['works','types','nature','eligible','profiles','prefill','legal','exclusions','active','questions','guides','triggers','recommendations'];
 return title('Administración','Ajusta los parámetros de evaluación y conserva su versión en cada resultado.',demo?btn('Archivar datos demo','clearDemo'):'')+panel('Parámetros · versión '+p.version,'<form id="params"><div class="formgrid">'+input('current','Tope vigente (USD)',p.current)+input('expanded','Tope ampliado (USD)',p.expanded)+input('absolute','Tope absoluto para giros elegibles (opcional)',p.absolute)+input('alert','Umbral de alerta (%)',p.alert)+input('months','Ventana de acumulado (meses)',p.months)+input('band1','Límite de E1 = 1 (USD)',p.bands[0])+input('band2','Límite de E1 = 2 (USD)',p.bands[1])+checks.map(([k,label])=>'<label style="display:block"><input type="checkbox" name="'+k+'" '+(p[k]?'checked':'')+'> '+label+'</label>').join('')+'</div><details class="group"><summary>Catálogos, perfiles, anclas y recomendaciones</summary><p class="muted group">Edita la configuración en formato JSON. Los índices de tipo de compra empiezan en 0.</p><div class="formgrid group">'+complex.map(k=>'<label>'+({works:'Obras y prefijos',types:'Tipos de compra',nature:'Naturaleza por tipo',eligible:'Índices de giros elegibles',profiles:'Perfiles operativos',prefill:'Exclusión sugerida por tipo',legal:'Modo Legal por nivel',exclusions:'Filtros de Legal',active:'Filtros activos',questions:'Preguntas y anclas',guides:'Preguntas guía',triggers:'Disparadores y evidencia',recommendations:'Recomendaciones'}[k])+'<textarea name="'+k+'">'+esc(JSON.stringify(p[k],null,2))+'</textarea></label>').join('')+'</div></details><div class="error" id="error" role="alert"></div><button class="btn primary">Guardar parámetros</button></form>')+(!demo?'<div class="group">'+panel('Usuarios','<form id="userForm" class="formgrid"><label>Nombre<input required name="name"></label><label>Correo<input required name="email" type="email"></label><label>Contraseña inicial<input required name="password" type="password" minlength="12"></label><fieldset><legend>Roles</legend>'+roles.map(r=>'<label style="display:block"><input type="checkbox" name="role" value="'+esc(r)+'"> '+esc(r)+'</label>').join('')+'</fieldset><div class="actions"><button class="btn primary">Crear usuario</button></div></form>')+'</div>':'');
}
function auditView(){
 return title('Bitácora de auditoría','Consulta las acciones registradas, su autor y su fecha.',btn('Exportar bitácora','auditCsv','','down'))+panel('Eventos',state.audit.length?'<ul class="timeline">'+state.audit.slice().reverse().map(e=>'<li><b>'+esc(e.action)+'</b><time>'+date(e.at)+' · '+esc(e.user)+' · '+esc(e.folio||'Configuración')+'</time>'+esc(e.comment)+'</li>').join('')+'</ul>':'<p class="muted">Todavía no hay eventos.</p>');
}
function modal(heading,body,submit,label='Guardar'){
 const dlg=$('#dialog');
 dlg.innerHTML='<form id="modalForm"><h2>'+esc(heading)+'</h2>'+body+'<div id="modalError" class="error" role="alert"></div><div class="actions">'+btn('Cerrar','close')+'<button class="btn primary">'+esc(label)+'</button></div></form>';
 dlg.showModal();
 $('#modalForm').onsubmit=async e=>{
   e.preventDefault();const button=e.submitter;button.disabled=true;
   try{await submit(new FormData(e.target));dlg.close();render();toast('Cambios guardados.');}
   catch(err){$('#modalError').textContent=err.message;button.disabled=false;}
 };
}
function exportCsv(name,rows){
 const safe=v=>{const s=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';};
 const url=URL.createObjectURL(new Blob(['﻿'+rows.map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function go(v){view=v;filter={};page=1;menu=false;chip='all';render();window.scrollTo(0,0);}
function home(){go(has('Solicitante')?'mine':has('Compras')?'purchases':has('Legal')?'legalq':has('Administrador','Dirección de Obra','Finanzas')?'dashboard':'reviews');}
const blank=()=>({providerKind:'',x:params().active.map(v=>v?null:false),guide:Array(7).fill(null),triggers:Array(6).fill(false),scores:{},evidence:{}});
const commentBox=(label='Comentario o evidencia')=>'<label>'+label+'<textarea name="comment" required></textarea></label>';
function detailAction(action,value){
 const r=available().find(r=>r.id===selected);
 let body=commentBox(), heading, label='Guardar';
 if(action==='review') heading='Atender revisión';
 if(action==='advance'){const noAuth=params().authorization===false;heading=noAuth?'Concluir análisis':'Enviar a autorización';label=noAuth?'Concluir análisis':'Continuar';body='<p class="hint">'+(noAuth?'Al concluir, el proceso termina en este sistema y Compras continúa con la requisición en el sistema de adquisiciones.':'La solicitud pasará a Dirección de Obra.')+'</p>'+(r.format?'':'<p class="error">Antes imprime el formato de análisis (botón «Imprimir formato»).</p>')+body;}
 if(action==='cancel') heading='Cancelar solicitud';
 if(action==='authorize'){heading='Decisión de Dirección de Obra';body='<label>Decisión'+select('decision',['Aprobada','Aprobada con condiciones','Rechazada'].map(x=>[x,x]),'Aprobada','')+'</label>'+body;}
 if(action==='instrument'){heading='Confirmar instrumento';const current=lvlOf(r);body='<p class="hint">Resultado del análisis: '+esc(instruments[r.evaluation.level])+'. Confirma el instrumento que se usará.</p><label>Instrumento'+select('level',maps(instruments).filter(([n])=>n>0&&(has('Legal')||n>=r.evaluation.level)),current,'')+'</label>'+body;}
 if(action==='ask'){heading=value==='Solicitante'?'Pedir información al solicitante':'Pedir información a Compras';body='<label>Tema'+select('topic',topics.map(x=>[x,x]),'','')+'</label>'+commentBox('¿Qué información necesitas?');label='Enviar solicitud';}
 if(action==='answer'){const q=r.requests.find(x=>x.id===value);heading='Responder solicitud de información';body='<div class="answer"><small>'+esc(q.from)+' pide · '+esc(q.topic)+'</small><p>'+esc(q.text)+'</p></div>'+commentBox('Tu respuesta');label='Enviar respuesta';}
 if(action==='legalReview'){heading='Enviar a revisión de Legal';body=commentBox('Motivo de la revisión');label='Enviar a Legal';}
 modal(heading,body,f=>send({action,id:r.id,task:value,stage:value,to:value,request:value,...Object.fromEntries(f)}),label);
}
function dataError(){
 const d=wizard;
 if(!d.work||d.type===''||d.type==null||!d.description?.trim()||!d.quantity||Number(d.quantity)<=0||!d.unit?.trim()||d.amount===''||d.amount==null||!Number.isFinite(Number(d.amount))||Number(d.amount)<0||!d.start||!d.end||!d.required||d.end<d.start)return 'Completa los datos de compra y verifica que el fin de vigencia no sea anterior al inicio.';
 if(!d.providerKind)return 'Indica si el proveedor ya está registrado o es nuevo.';
 if(!d.provider?.trim()||!d.tax?.trim())return d.providerKind==='new'?'Escribe la razón social y el RFC / ID fiscal del proveedor nuevo.':'Selecciona al proveedor de la lista.';
 if(!d.file?.name)return 'Adjunta la cotización.';
 return '';
}
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el)return;
 const [a,...tail]=el.dataset.action.split(':'),v=tail.join(':');
 try{
 if(a==='nav'){go(v);return;}
 if(a==='home'){home();return;}
 if(a==='menu'){menu=!menu;render();return;}
 if(a==='logout'){await api('/api/logout',{});user=null;render();return;}
 if(a==='new'||a==='edit'){previewPrevious=null;wizard=a==='new'?blank():structuredClone(available().find(r=>r.id===v));step=0;blk=0;go('wizard');return;}
 if(a==='example'){wizard={...sample(),work:params().works.CRJ?'CRJ':Object.keys(params().works)[0],file:{name:'Cotización de demostración.pdf'}};step=0;blk=0;render();return;}
 if(a==='detail'){selected=v;tab='sum';go('detail');return;}
 if(a==='tab'){tab=v;render();return;}
 if(a==='chip'){chip=v;page=1;render();return;}
 if(a==='blk'){blk=+v;render();return;}
 if(a==='print'){await send({action:'format',id:selected});view='print';render();window.scrollTo(0,0);return;}
 if(a==='printback'){view='detail';tab='buy';render();window.scrollTo(0,0);return;}
 if(a==='doPrint'){try{window.print();}catch{}toast('Si no se abre la impresión, usa Ctrl/Cmd + P.');return;}
 if(a==='ack'){await send({action:'ack',id:selected,request:v});render();toast('Respuesta revisada.');return;}
 if(a==='resetDemo'){try{localStorage.removeItem('itm-compra-demo-v4');localStorage.removeItem(seenKey);}catch{}state=freshDemo();persist();home();toast('Demo reiniciada con los datos de ejemplo.');return;}
 if(a==='close'){$('#dialog').close();return;}
 if(a==='guide'){showGuide();return;}
 if(a==='reset'){filter={};page=1;render();return;}
 if(a==='prevpage'||a==='nextpage'){page+=a==='nextpage'?1:-1;render();return;}
 if(a==='backstep'){if(step){step--;render();window.scrollTo(0,0);}else home();return;}
 if(a==='nextstep'){
   let err='';
   if(step===0)err=dataError();
   else if(step===1&&wizard.x.some((x,i)=>params().active[i]&&typeof x!=='boolean'))err='Responde los filtros de Legal.';
   else if(step===2){const pend=blocks().filter(b=>!b.done).map(b=>b.t);if(pend.length)err='Faltan bloques por completar: '+pend.join(', ')+'.';}
   if(err){$('#error').textContent=err;return;}
   if(step===2&&!demo){el.disabled=true;previewPrevious=(await api('/api/accumulated',{work:wizard.work,tax:wizard.tax,id:wizard.id})).previous;}
   step++;render();window.scrollTo(0,0);return;
 }
 if(a==='save'||a==='send'){
   if(a==='send'&&dataError())throw new Error(dataError());
   el.disabled=true;
   const {row}=await send({action:a,id:wizard.id,data:wizard});
   if(a==='send'){selected=row.id;tab='sum';go('detail');toast('Solicitud enviada · '+row.folio);}else{wizard.id=row.id;el.disabled=false;toast('Borrador guardado.');}
   return;
 }
 if(a==='export'){
   const rows=filtered(available()).filter(r=>r.folio);
   exportCsv('solicitudes-itm',[['Folio','Descripción','Proveedor','USD','Instrumento','Riesgo','Estado','Fecha'],...rows.map(r=>[r.folio,r.description,r.provider,r.amount,instruments[lvlOf(r)],r.evaluation?.risk,statusText(r.status),r.sentAt])]);return;
 }
 if(a==='auditCsv'){exportCsv('bitacora-itm',[['Folio','Fecha','Usuario','Acción','Comentario','Anterior','Nuevo'],...state.audit.map(x=>[x.folio,x.at,x.user,x.action,x.comment,JSON.stringify(x.before),JSON.stringify(x.after)])]);return;}
 if(a==='notice'){await send({action:'notice',id:v});render();toast('Aviso marcado como leído.');return;}
 if(a==='clearDemo'){modal('Archivar datos de demostración','<p>Las solicitudes demo se marcarán como canceladas.</p>',()=>send({action:a}));return;}
 if(a==='provider'){
   const p=state.providers.find(p=>p.tax===v)??{};
   modal('Datos del proveedor',['name','tax','contact','email'].map((k,i)=>'<label>'+['Razón social','RFC / ID fiscal','Contacto','Correo'][i]+'<input name="'+k+'" value="'+esc(p[k])+'" '+(i<2?'required':'')+(i===3?' type="email"':'')+'></label>').join('')+'<label>Estado'+select('status',['Activo','En alta','Bloqueado'].map(x=>[x,x]),p.status||'En alta','')+'</label>',f=>send({action:'provider',provider:Object.fromEntries(f)}));return;
 }
 if(['review','instrument','authorize','advance','cancel','ask','answer','legalReview'].includes(a))detailAction(a,v);
 }catch(err){el.disabled=false;if($('#error'))$('#error').textContent=err.message;else toast(err.message);}
});
document.addEventListener('input',e=>{
 const t=e.target;if(!t.closest('#wizard')||!['text','number','date','textarea'].includes(t.type))return;
 const [k,v]=t.name.split(':');
 if(k==='evidence')wizard.evidence[v]=t.value;else wizard[k]=t.value;
});
document.addEventListener('change',async e=>{
 const t=e.target;
 if(t.name==='demoRole'){user=demoUsers[+t.value];home();return;}
 if(t.closest('#filters')){filter=Object.fromEntries(new FormData(t.form));page=1;render();return;}
 if(!t.closest('#wizard'))return;
 const [k,v]=t.name.split(':');
 if(k==='quote'){
   const f=t.files[0];if(!f)return;
   if(f.size>10485760||!/\.(pdf|jpe?g|png|xlsx|docx)$/i.test(f.name)){$('#error').textContent='Formato inválido o archivo mayor de 10 MB.';return;}
   wizard.file={name:f.name,type:f.type};
   if(!demo)wizard.file.data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(f);});
 }else if(k==='score'){
   const n=t.value===''?null:+t.value;wizard.scores[v]=n;
   if(n>0&&!wizard.evidence[v]?.trim())wizard.evidence[v]=params().questions[v][1+n];
 }
 else if(k==='x')wizard.x[v]=t.value?t.value==='Sí':null;
 else if(k==='guide')wizard.guide[v]=t.value;
 else if(k==='providerKind'){wizard.providerKind=t.value;wizard.provider='';wizard.tax='';}
 else if(k==='providerChoice'){const p=state.providers.find(p=>p.tax===t.value);wizard.provider=p?.name||'';wizard.tax=p?.tax||'';}
 else if(t.tagName==='SELECT')wizard[k]=t.value;
 else return;
 render();document.querySelector('#wizard [name="'+CSS.escape(t.name)+'"]')?.focus({preventScroll:true});
});
document.addEventListener('submit',async e=>{
 const f=e.target;if(!['lookup','login','params','userForm','wizard','filters'].includes(f.id))return;
 e.preventDefault();const data=new FormData(f),o=Object.fromEntries(data);
 try{
 if(f.id==='lookup'){const r=available().find(r=>r.folio?.toLowerCase()===o.folio.trim().toLowerCase());if(!r)throw new Error('Folio no disponible para tu perfil.');selected=r.id;tab='sum';go('detail');}
 if(f.id==='login'){const result=await api('/api/login',o);user=result.user;state=(await api('/api/state')).state;const folio=new URLSearchParams(location.search).get('folio');const row=folio&&available().find(r=>r.folio===folio);if(row){selected=row.id;tab='sum';go('detail');}else home();}
 if(f.id==='params'){
  if(!has('Administrador')){await send({action:'params',params:{current:Number(o.current),expanded:Number(o.expanded),alert:Number(o.alert),months:Number(o.months),bands:[Number(o.band1),Number(o.band2)]}});render();toast('Parámetros actualizados. Legal recibió el aviso.');return;}
  const p=structuredClone(params());for(const k of ['current','expanded','alert','months'])p[k]=Number(o[k]);
  p.absolute=o.absolute===''?null:Number(o.absolute);p.bands=[Number(o.band1),Number(o.band2)];
  for(const k of ['applyBelow','budget','notify'])p[k]=data.has(k);
  for(const k of ['works','types','nature','eligible','profiles','prefill','legal','exclusions','active','questions','guides','triggers','recommendations'])p[k]=JSON.parse(o[k]);
  await send({action:'params',params:p});render();toast('Parámetros actualizados.');
 }
 if(f.id==='userForm'){await api('/api/users',{...o,roles:data.getAll('role')});f.reset();toast('Usuario creado.');}
 }catch(err){if($('#error'))$('#error').textContent=err.message;else toast(err.message);}
});
demo=document.querySelector('meta[name="itm-mode"]').content==='demo';
try{
 if(demo)loadDemo();
 else {
   const info=await api('/api/mode');
   if(info.user){user=info.user;state=(await api('/api/state')).state;}
 }
 if(user)home();else render();
 const folio=new URLSearchParams(location.search).get('folio');
 const row=folio&&user&&available().find(r=>r.folio===folio);
 if(row){selected=row.id;tab='sum';go('detail');}
}catch(error){user=null;render();$('#error').textContent=error.message;}
