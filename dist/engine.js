export const instruments = ['Pendiente','Orden de Servicio','Contrato Marco','Contrato formal'];
export const groups = [['T1','T2'],['T3'],['J2'],['J1'],['J3'],['E2'],['E3']];
export const topics = ['Información del proveedor','Información para el contrato','Alcance o especificaciones','Cotización o documentos','Otra'];
export const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumFractionDigits:2}).format(n);
export function evaluate(d, p, previous = 0) {
  const amount = Math.round((Number(d.amount) + previous)*100)/100;
  const scores = {E1: amount === 0 ? 0 : amount <= p.bands[0] ? 1 : amount <= p.bands[1] ? 2 : 3};
  const evidence = {E1:'Cálculo por bandas sobre el monto evaluado'};
  const record = (key, value, minimum = 0) => {
    if (!Number.isInteger(value) || value < minimum || value > 3 || (value && !d.evidence?.[key]?.trim())) return;
    scores[key] = value;
    evidence[key] = value ? d.evidence[key].trim() : 'Declarado por el solicitante: no aplica';
  };
  ['O1','O2','O3'].forEach(key => record(key,d.scores?.[key]));
  groups.forEach((keys,index) => keys.forEach(key => {
    if (d.guide?.[index] === 'No') record(key,0);
    if (d.guide?.[index] === 'Sí') record(key,d.scores?.[key],1);
  }));
  if (Object.keys(scores).length !== 12 || !Number.isFinite(amount) || amount < 0 ||
      ![0,1,2,3,4].every(i => typeof d.x?.[i] === 'boolean') ||
      ![0,1,2,3,4,5].every(i => typeof d.triggers?.[i] === 'boolean')) return {level:0,risk:'PENDIENTE',scores,evidence,amount,previous};
  const dimensions = ['E','O','J','T'].map(key=>Math.max(...[1,2,3].map(i=>scores[key+i])));
  const total = dimensions.reduce((sum,n)=>sum+n,0);
  const matrix = dimensions.includes(3) || total >= 8 ? 3 : total >= 4 ? 2 : 1;
  const excluded = d.x.some((value,index)=>value && p.active[index]);
  const current = amount <= p.current && (!p.applyBelow || !excluded);
  const expanded = !excluded && amount <= p.expanded;
  const eligibleType = !excluded && p.eligible.includes(Number(d.type)) && (p.absolute == null || amount <= p.absolute);
  const legal = current || expanded || eligibleType ? 1 : 2;
  const level = Math.max(matrix,legal);
  const route = current ? 'Tope vigente' : expanded ? 'Tope ampliado' : eligibleType ? 'Giro elegible' : excluded ? 'Exclusiones de Legal' : 'Monto fuera de los topes aplicables';
  return {level,risk:['','BAJO','MEDIO','ALTO'][matrix],scores,evidence,amount,previous,dimensions,total,
    route,rule:matrix > legal ? 'Nivel determinado por la matriz de riesgo' : legal > matrix ? 'Nivel mínimo de Legal: '+route : 'Coinciden matriz y regla de Legal: '+route,
    blocked:d.triggers.includes(true),alert:amount > p.expanded*p.alert/100,fragmentation:previous>0 && amount>p.expanded,
    warnings:p.notify ? [scores.T2>=2,scores.T1>=2,scores.T3>=2||scores.J3===3,scores.O1===3,scores.J1>=2,scores.E2>=2].flatMap((hit,i)=>hit&&!d.triggers[i]?[i]:[]) : []};
}
const guideOf=Object.fromEntries(groups.flatMap((keys,i)=>keys.map(k=>[k,i])));
export function deriveTriggers(d){
  const s=k=>k in guideOf?(d.guide?.[guideOf[k]]==='Sí'?Number(d.scores?.[k]??0):0):Number(d.scores?.[k]??0);
  return [s('T2')>=2,s('T1')>=2,s('T3')>=2||s('J3')===3,s('O1')===3,s('J1')>=2,s('E2')>=2];
}
export function accumulate(rows,d,p,now=new Date()){
  const cutoff=new Date(now);
  const day=cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth()-p.months);
  const last=new Date(Date.UTC(cutoff.getUTCFullYear(),cutoff.getUTCMonth()+1,0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day,last));
  return rows.filter(r=>r.id!==d.id && r.folio && r.work===d.work && r.tax?.trim().toUpperCase()===d.tax?.trim().toUpperCase() && !['Cancelada','Rechazada'].includes(r.status) && new Date(r.sentAt)>=cutoff && new Date(r.sentAt)<=now).reduce((sum,r)=>sum+Number(r.amount),0);
}
export const roles=['Solicitante','Compras','Legal','Finanzas','TI y Seguridad','Dirección de Obra','Administrador'];
export function canSee(row,user){
  return row.owner===user.email || (!!row.folio && user.roles.some(role=>['Administrador','Compras','Legal','Finanzas','Dirección de Obra'].includes(role) || row.tasks?.some(task=>task.role===role)));
}
export const legalTask=p=>({id:'legal',role:'Legal',label:p?.reduced?'Contrato: elaboración y validación':'Validación del instrumento',evidence:'Instrumento y condiciones aplicables'});
export function tasksFor(d,p,result){
  const mapping=[['Legal','TI y Seguridad'],['TI y Seguridad'],['Legal','TI y Seguridad'],['Dirección de Obra'],['Legal'],['Finanzas','Legal']];
  let tasks;
  if(p.reduced){
    const hits=d.triggers.flatMap((hit,i)=>hit?[p.triggers[i][0]]:[]);
    tasks=hits.length?[{id:'special',role:'Legal',label:'Revisión especializada',evidence:hits.join('; '),special:true}]:[];
  } else tasks=d.triggers.flatMap((hit,i)=>hit?mapping[i].map(role=>({id:'t'+i+role,role,label:p.triggers[i][0],evidence:p.triggers[i][2],special:true})):[]);
  if(p.budget) tasks.push({id:'budget',role:'Finanzas',label:'Validación presupuestal',evidence:'Partida, saldo y disponibilidad'});
  if(p.legal[result.level-1]==='Siempre') tasks.push(legalTask(p));
  return tasks;
}
export const lvlOf=r=>r.finalLevel??r.evaluation?.level??0;
export const legalOwns=r=>lvlOf(r)===3||!!r.legalReview||(r.tasks??[]).some(t=>t.role==='Legal');
export const DONE='Análisis concluido';
export const isConcluded=s=>[DONE,'Autorizada','En ejecución','Cerrada'].includes(s);
export function stageInfo(r,p={}){
  const lvl=lvlOf(r),legalTasks=(r.tasks??[]).filter(t=>t.role==='Legal');
  const contract=lvl>=2||legalTasks.length>0,auth=p.authorization!==false;
  const stages=[{k:'sent',label:'Solicitud enviada',who:'Solicitante'},{k:'analysis',label:'Análisis de Compras',who:'Compras'}];
  if(contract)stages.push({k:'contract',label:lvl===3?'Contrato formal':lvl===2&&!legalTasks.length?'Contrato Marco':'Revisión de Legal',who:lvl===3||legalTasks.length?'Legal':'Compras'});
  if(auth)stages.push({k:'auth',label:'Autorización',who:'Dirección de Obra'});
  stages.push({k:'done',label:DONE,who:'Compras',sub:'Fin del proceso en este sistema'});
  const idx=k=>stages.findIndex(x=>x.k===k),s=r.status;
  let cur;
  if(isConcluded(s))cur=stages.length;
  else if(s==='Pendiente de autorización')cur=idx('auth');
  else if(s==='En formalización'||s.startsWith('Bloqueada'))cur=contract?idx('contract'):idx('analysis');
  else cur=idx('analysis');
  if(s==='Rechazada')cur=Math.max(idx('auth'),idx('analysis'));
  if(s==='Cancelada')cur=idx('analysis');
  const stopped=['Cancelada','Rechazada'].includes(s);
  stages.forEach((x,i)=>x.state=i<cur?'done':i===cur?(stopped?'stopped':'current'):'todo');
  const open=(r.requests??[]).filter(q=>q.status==='Abierta');
  const legalFinished=legalTasks.length>0&&legalTasks.every(t=>t.done);
  const who=stages[cur]?.k==='contract'&&legalFinished?'Compras':stages[cur]?.who;
  return {stages,cur,open,waiting:stopped||cur>=stages.length?'':open.length?open[0].to:who};
}
