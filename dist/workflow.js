import {accumulate,canSee,evaluate,tasksFor,legalOwns,legalTask,DONE,isConcluded} from './engine.js';
export function command(state,user,input) {
 const {action}=input, admin=user.roles.includes('Administrador'), has=role=>user.roles.includes(role);
 const reject=msg=>{throw new Error(msg)};
 const at=new Date().toISOString();
 const audit=(row,action,comment='',before=null,after=null)=>{
   const event={at,user:user.email,action,comment,before,after,folio:row.folio};
   row.history.push(event);state.audit.push(event);
 };
 if(action==='params'){
   if(!admin&&!has('Compras')) reject('Acceso restringido.');
   const old=state.params,p={...old,...input.params,version:old.version+1};
   if(!admin) for(const key of Object.keys(input.params??{})) if(!['current','expanded','absolute','bands','months','alert'].includes(key)&&JSON.stringify(input.params[key])!==JSON.stringify(old[key])) reject('Compras solo ajusta topes, bandas, ventana y porcentaje de alerta.');
   if(!Number.isFinite(p.current)||!Number.isFinite(p.expanded)||p.current<0||p.expanded<p.current||
      !Number.isInteger(p.months)||p.months<1||p.months>120||!(p.alert>=1&&p.alert<=100)||
      !p.bands.every(Number.isFinite)||p.bands.length!==2||p.bands[1]<p.bands[0]||p.bands[0]<0||
      (p.absolute!==null&&(!Number.isFinite(p.absolute)||p.absolute<0))) reject('Verifica los topes, bandas, ventana y porcentaje.');
   for(const key of ['eligible','active','exclusions','legal','types','nature','profiles','prefill','recommendations','triggers']) if(!Array.isArray(p[key])||p[key].length!==old[key].length && !['eligible','types','nature','profiles','prefill'].includes(key)) reject('Verifica la estructura de '+key);
   if(!Object.keys(p.works).every(k=>/^[A-Z0-9]{2,12}$/.test(k))||!Object.keys(p.works).length||Object.keys(p.questions).length!==12) reject('Verifica obras y preguntas.');
   const labels=[['current','Tope vigente (USD)'],['expanded','Tope ampliado (USD)'],['absolute','Tope absoluto (USD)'],['months','Ventana de acumulado (meses)'],['alert','Alerta de tope (%)']];
   const changes=labels.filter(([k])=>old[k]!==p[k]).map(([k,l])=>({label:l,from:old[k],to:p[k]}));
   [0,1].forEach(i=>{if(old.bands[i]!==p.bands[i])changes.push({label:'Banda E1 · límite '+(i+1)+' (USD)',from:old.bands[i],to:p.bands[i]});});
   if(!changes.length) reject('No hay cambios en los valores.');
   state.notices??=[];
   state.notices.push({id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),kind:'params',to:'Legal',at,by:user.email,version:p.version,changes,read:null});
   state.params=p;audit({history:[]},'Parámetros actualizados · aviso a Legal',changes.map(c=>c.label+': '+c.from+' → '+c.to).join('; '),old,p);return {notice:true};
 }
 if(action==='notice'){
   const n=(state.notices??[]).find(x=>x.id===input.id);
   if(!n||!has(n.to)||n.read) reject('Aviso no disponible.');
   n.read={at,by:user.email};audit({history:[]},'Aviso de parámetros leído','Versión '+n.version);return {notice:true};
 }
 if(action==='provider'){
   if(!has('Compras')&&!admin) reject('Acceso restringido.');
   const {name,tax,contact,email,status}=input.provider;
   if(!name?.trim()||!tax?.trim()||!['Activo','En alta','Bloqueado'].includes(status)) reject('Completa razón social, ID fiscal y estado.');
   const provider={name:name.trim(),tax:tax.trim().toUpperCase(),contact,email,status};
   const index=state.providers.findIndex(p=>p.tax===provider.tax);
   const old=state.providers[index]??null;
   if(index<0)state.providers.push(provider);else state.providers[index]=provider;
   audit({history:[]},'Proveedor registrado',provider.tax,old,provider);return {};
 }
 if(action==='clearDemo'){
   if(!admin) reject('Acceso restringido.');
   state.rows.filter(r=>r.demo).forEach(r=>{r.status='Cancelada';r.hidden=true;audit(r,'Datos demo archivados');});return {};
 }
 const existing=state.rows.find(r=>r.id===input.id);
 if(action==='save'||action==='send'){
   if(!has('Solicitante')) reject('Solo un solicitante puede registrar compras.');
   if(existing&&(existing.owner!==user.email||existing.folio)) reject('Solo puedes editar tus borradores.');
   const fields=['work','type','description','quantity','unit','amount','start','end','required','providerKind','provider','tax','budgetLine','x','guide','scores','evidence','triggers','file'];
   const d=Object.fromEntries(fields.map(key=>[key,input.data[key]]));
   d.amount=Number(d.amount);d.tax=String(d.tax??'').trim().toUpperCase();
   d.demo=state.demo===true;
   const row={...d,id:existing?.id??crypto.randomUUID(),owner:user.email,createdAt:existing?.createdAt??at,history:existing?.history??[],requests:existing?.requests??[],status:'Borrador'};
   let newProvider=false;
   if(action==='send'){
     const p=state.params;
     if(!Object.hasOwn(p.works,d.work)||!p.types[d.type]||!Number.isFinite(d.amount)||d.amount<0||Number(d.quantity)<=0||
        !['description','quantity','unit','start','end','required','provider','tax'].every(key=>typeof d[key]==='string'&&d[key].trim())||
        ![d.start,d.end,d.required].every(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date)))||d.start>d.end||
        !(d.file?.name&&(state.demo||d.file.data))) reject('Completa los datos, verifica la vigencia y adjunta la cotización.');
     if(state.providers.some(provider=>provider.tax===d.tax&&provider.status==='Bloqueado')) reject('El proveedor está bloqueado.');
     if(!state.providers.some(provider=>provider.tax===d.tax)){state.providers.push({name:d.provider.trim(),tax:d.tax,status:'En alta'});newProvider=true;}
     const result=evaluate(d,p,accumulate(state.rows,d,p));
     if(!result.level) reject('Completa la evaluación y documenta las puntuaciones.');
     const year=new Intl.DateTimeFormat('en',{timeZone:'America/Cancun',year:'numeric'}).format(new Date());
     const prefix=d.work+'-'+year+'-';
     const seq=state.rows.filter(r=>r.folio?.startsWith(prefix)).reduce((n,r)=>Math.max(n,+r.folio.slice(prefix.length)),0)+1;
     Object.assign(row,{folio:prefix+String(seq).padStart(4,'0'),sentAt:at,evaluation:{...result,params:structuredClone(p)},tasks:tasksFor(d,p,result),
        status:result.blocked?'Bloqueada por revisión especializada':'En análisis de Compras'});
   }
   audit(row,action==='send'?'Envío a Compras':'Borrador guardado','',existing?.status??null,row.status);
   if(newProvider)audit(row,'Proveedor nuevo en alta',row.tax+' · Compras debe validarlo y activarlo');
   if(existing) state.rows[state.rows.indexOf(existing)]=row;else state.rows.unshift(row);
   return {row};
 }
 if(!existing||!canSee(existing,user)||!existing.folio) reject('Solicitud no disponible.');
 const row=existing, old=row.status, comment=String(input.comment??'').trim();
 if(action==='format'){
   if(!has('Compras')) reject('Solo Compras genera el formato de análisis.');
   row.format={at:row.format?.at??at,user:row.format?.user??user.email,last:at,count:(row.format?.count??0)+1};
   audit(row,'Formato de análisis generado','Impresión o PDF · '+user.roles[0]);return {row};
 }
 if(action==='ack'){
   const q=row.requests?.find(x=>x.id===input.request);
   if(!q||q.status!=='Respondida'||!has(q.from)) reject('No hay una respuesta pendiente de revisar.');
   q.status='Atendida';audit(row,'Respuesta revisada','['+q.topic+']',old,old);return {row};
 }
 if(!comment) reject('Registra el comentario o evidencia.');
 if(isConcluded(old)||['Cancelada','Rechazada'].includes(old)) reject('La solicitud ya terminó.');
 if(action==='review'){
   const task=row.tasks.find(t=>t.id===input.task);
   if(!task||task.done||!has(task.role)) reject('La revisión no está asignada a tu área.');
   if(row.requests?.some(q=>q.status==='Abierta'&&q.from===task.role)) reject('Espera la respuesta a tu solicitud de información.');
   Object.assign(task,{done:true,comment,at,user:user.email});
   if(row.status.startsWith('Bloqueada')&&!row.tasks.some(t=>t.special&&!t.done)) row.status='En análisis de Compras';
 }else if(action==='instrument'){
   const level=Number(input.level), prior=row.finalLevel??row.evaluation.level;
   if(has('Legal')&&!has('Compras')&&!legalOwns(row)) reject('Legal solo modifica las solicitudes que requieren contrato.');
   if((!has('Compras')&&!has('Legal'))||(!has('Legal')&&level<prior)||![1,2,3].includes(level)||row.authorization) reject('El rol o el estado impiden ajustar el instrumento.');
   row.finalLevel=level;
   if(row.evaluation.params.legal[level-1]==='Siempre'&&!row.tasks.some(t=>t.id==='legal')) row.tasks.push(legalTask(row.evaluation.params));
   if(!row.status.startsWith('Bloqueada')) row.status='En formalización';
   audit(row,'Instrumento confirmado o ajustado',comment,prior,level);return {row};
 }else if(action==='authorize'){
   if(!has('Dirección de Obra')||old!=='Pendiente de autorización'||row.tasks.some(t=>!t.done)||!['Aprobada','Aprobada con condiciones','Rechazada'].includes(input.decision)) reject('La solicitud aún no está lista para autorizar.');
   row.authorization={decision:input.decision,user:user.email,at,comment};
   row.status=input.decision==='Rechazada'?'Rechazada':DONE;
   if(row.status===DONE)row.concluded={at,user:user.email};
 }else if(action==='advance'){
   if(!has('Compras')||!['En análisis de Compras','En formalización'].includes(old)) reject('La solicitud no está en una etapa que permita continuar.');
   if(row.requests?.some(q=>q.status==='Abierta')) reject('Hay solicitudes de información sin responder.');
   if(row.tasks.some(t=>!t.done)||!row.finalLevel) reject('Completa las revisiones y confirma el instrumento.');
   if(!state.providers.some(p=>p.tax===row.tax&&p.status==='Activo')) reject('Da de alta y activa al proveedor.');
   if(row.evaluation.params.requireFormat!==false&&!row.format) reject('Imprime el formato de análisis antes de concluir.');
   if(state.params.authorization===false){row.status=DONE;row.concluded={at,user:user.email};}else row.status='Pendiente de autorización';
 }else if(action==='ask'){
   const to=input.to,fromCompras=has('Compras')&&to==='Solicitante',fromLegal=has('Legal')&&to==='Compras'&&legalOwns(row);
   if(!fromCompras&&!fromLegal) reject('No puedes pedir información a esa área.');
   const topic=input.topic||'Otra';
   (row.requests??=[]).push({id:crypto.randomUUID(),from:fromCompras?'Compras':'Legal',to,topic,text:comment,at,by:user.email,status:'Abierta'});
   audit(row,'Información solicitada a '+to,'['+topic+'] '+comment,old,old);return {row};
 }else if(action==='answer'){
   const q=row.requests?.find(x=>x.id===input.request);
   if(!q||q.status!=='Abierta') reject('La solicitud ya fue respondida.');
   if(!(q.to==='Solicitante'?row.owner===user.email:has(q.to))) reject('Esta solicitud no está dirigida a tu perfil.');
   Object.assign(q,{status:'Respondida',answer:comment,answeredAt:at,answeredBy:user.email});
   audit(row,'Información entregada a '+q.from,comment,old,old);return {row};
 }else if(action==='legalReview'){
   if(!has('Compras')||row.authorization) reject('El rol o el estado impiden enviar a Legal.');
   if(!row.tasks.some(t=>t.role==='Legal'))row.tasks.push({id:'legalReview',role:'Legal',label:'Revisión solicitada por Compras',evidence:comment});
   row.legalReview=true;audit(row,'Enviada a revisión de Legal',comment,old,old);return {row};
 }else if(action==='cancel'){
   if(!has('Compras')&&!admin) reject('Acceso restringido.');
   row.status='Cancelada';
 }else reject('Acción desconocida.');
 const isLegalTask=action==='review'&&row.tasks.find(t=>t.id===input.task)?.role==='Legal';
 const labels={review:isLegalTask?'Legal concluyó su parte':'Revisión atendida',authorize:'Decisión de Dirección de Obra',advance:row.status===DONE?'Análisis concluido · Compras continúa en el sistema de adquisiciones':'Envío a autorización',cancel:'Solicitud cancelada'};
 audit(row,labels[action],comment,old,row.status);return {row};
}
