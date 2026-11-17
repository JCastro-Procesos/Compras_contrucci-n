import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaults} from './dist/config.js';
import {providers,seed} from './dist/demo.js';
import {accumulate,canSee,instruments,roles} from './dist/engine.js';
import {command} from './dist/workflow.js';

const root=dirname(fileURLToPath(import.meta.url));
const env=process.env;
const dbPath=env.ITM_DB||join(root,'data','itm.sqlite');
if(dbPath!==':memory:')mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec(`
 PRAGMA journal_mode=WAL;
 PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY,name TEXT NOT NULL,roles TEXT NOT NULL,password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,email TEXT NOT NULL REFERENCES users(email),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS failures(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, owner TEXT NOT NULL, folio TEXT UNIQUE, payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS request_owner ON requests(owner);
 CREATE TABLE IF NOT EXISTS attachments(request_id TEXT PRIMARY KEY REFERENCES requests(id),name TEXT NOT NULL,type TEXT NOT NULL,bytes BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS providers(tax TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS params(version INTEGER PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS audit_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Bitácora inmutable'); END;
 CREATE TRIGGER IF NOT EXISTS audit_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Bitácora inmutable'); END;
 CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY,payload TEXT NOT NULL,attempts INTEGER DEFAULT 0,next INTEGER DEFAULT 0,sent INTEGER,last_error TEXT);
 PRAGMA foreign_keys=ON;
`);
const json=JSON.stringify, parse=JSON.parse, stmt=sql=>db.prepare(sql), now=()=>Date.now();
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const emailOf=s=>String(s??'').trim().toLowerCase();
const passwordHash=(password,salt=randomBytes(16).toString('hex'))=>salt+':'+scryptSync(password,salt,64).toString('hex');
const digest=token=>createHash('sha256').update(token).digest('hex');
const validEmail=s=>s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
function createUser(input){
 const email=emailOf(input.email), name=String(input.name??'').trim(), password=input.password;
 if(!validEmail(email)||!name||typeof password!=='string'||password.length<12||password.length>128||!Array.isArray(input.roles)||!input.roles.length||!input.roles.every(r=>roles.includes(r)))throw fail('Completa nombre, correo válido, roles y una contraseña de 12 a 128 caracteres.');
 if(stmt('SELECT 1 FROM users WHERE email=?').get(email))throw fail('Ese correo ya está registrado.');
 stmt('INSERT INTO users VALUES(?,?,?,?)').run(email,name,json([...new Set(input.roles)]),passwordHash(password));
}
if(!stmt('SELECT 1 FROM params').get())stmt('INSERT INTO params VALUES(?,?)').run(1,json(defaults));
if(!stmt('SELECT 1 FROM users').get()){
 if(!env.ITM_ADMIN_EMAIL||!env.ITM_ADMIN_PASSWORD)throw new Error('Configura ITM_ADMIN_EMAIL e ITM_ADMIN_PASSWORD antes de iniciar.');
 createUser({email:env.ITM_ADMIN_EMAIL,name:env.ITM_ADMIN_NAME||'Administrador ITM',password:env.ITM_ADMIN_PASSWORD,roles:['Administrador','Solicitante']});
 if(env.ITM_SEED_DEMO==='1'){
   for(const p of providers)stmt('INSERT INTO providers VALUES(?,?)').run(p.tax,json(p));
   for(const item of seed())stmt('INSERT INTO requests VALUES(?,?,?,?)').run(item.id,item.owner,item.folio,json(item));
 }
}
const cookieName='itm_session';
const secure=env.ITM_PUBLIC_URL?.startsWith('https://')||env.ITM_SECURE_COOKIE==='1';
const cookie=(value,age)=>cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(secure?'; Secure':'');
function session(req){
 const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return {};
 const hash=digest(token);
 const u=stmt('SELECT users.email,name,roles FROM users JOIN sessions USING(email) WHERE hash=? AND expires>?').get(hash,now());
 return {hash,user:u?{...u,roles:parse(u.roles)}:null};
}
function jsonResponse(res,value,status=200,headers={}){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(json(value));
}
async function body(req){
 if(!req.headers['content-type']?.startsWith('application/json'))throw fail('Se requiere JSON.',415);
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>15000000)throw fail('La solicitud supera el tamaño permitido.',413);chunks.push(chunk);}
 try{return parse(Buffer.concat(chunks));}catch{throw fail('Solicitud inválida.');}
}
const list=sql=>stmt(sql).all().map(x=>parse(x.payload));
function getState(){
 return {params:parse(stmt('SELECT payload FROM params ORDER BY version DESC LIMIT 1').get().payload),rows:list('SELECT payload FROM requests ORDER BY rowid DESC'),providers:list('SELECT payload FROM providers ORDER BY tax'),notices:list('SELECT payload FROM notices ORDER BY rowid'),audit:[]};
}
const quoteFormats={
 pdf:['application/pdf',b=>b.subarray(0,5).toString()==='%PDF-'],
 jpg:['image/jpeg',b=>b.subarray(0,3).toString('hex')==='ffd8ff'],
 jpeg:['image/jpeg',b=>b.subarray(0,3).toString('hex')==='ffd8ff'],
 png:['image/png',b=>b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'],
 xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',b=>b.subarray(0,4).toString('hex')==='504b0304'&&b.includes(Buffer.from('xl/workbook.xml'))],
 docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document',b=>b.subarray(0,4).toString('hex')==='504b0304'&&b.includes(Buffer.from('word/document.xml'))]
};
function validateQuote(file){
 const name=String(file.name??'').trim(), format=quoteFormats[name.split('.').pop().toLowerCase()];
 if(!name||name.length>160||!format||typeof file.data!=='string'||!/^[a-zA-Z0-9+/]+=*$/.test(file.data))throw fail('Cotización inválida.');
 const bytes=Buffer.from(file.data,'base64');
 if(!bytes.length||bytes.length>10485760||!format[1](bytes))throw fail('El contenido de la cotización no corresponde al formato o excede 10 MB.');
 return {name,type:format[0],bytes};
}
function enqueue(to,subject,text,requestId=null){
 if(!to)return;
 stmt('INSERT INTO outbox(payload) VALUES(?)').run(json({to,subject,text,requestId}));
}
function queueNotice(input,row,state){
 if(input.action==='params'){const n=state.notices.at(-1);enqueue(env.ITM_LEGAL_EMAIL,'Cambio en los parámetros de evaluación (versión '+n.version+')',n.changes.map(c=>c.label+': '+c.from+' → '+c.to).join('\n')+'\nCambio hecho por: '+n.by);return;}
 if(!row?.folio)return;
 const url=env.ITM_PUBLIC_URL||'http://localhost:'+(env.PORT||3000);
 const link=url.replace(/\/$/,'')+'/?folio='+encodeURIComponent(row.folio);
 const e=row.evaluation;
 if(input.action==='send'){
   const summary=[row.folio,'Solicitante: '+row.owner,'Obra: '+state.params.works[row.work],'Fecha: '+row.sentAt,
      'Compra: '+state.params.types[row.type]+' · '+state.params.nature[row.type],'Proveedor: '+row.provider,
      'Monto USD: '+row.amount,'Monto evaluado USD: '+e.amount,'Riesgo: '+e.risk+' · '+e.total+'/12',
      'Instrumento: '+instruments[e.level],'Regla: '+e.rule,'Filtros marcados: '+row.x.flatMap((x,i)=>x?['X'+(i+1)]:[]).join(', '),
      'Revisiones: '+row.tasks.map(t=>t.role+' · '+t.label).join('; '),link].join('\n');
   enqueue(env.ITM_COMPRAS_EMAIL,'['+row.folio+'] Solicitud de compra – '+state.params.types[row.type]+' – '+row.provider+' – USD '+row.amount,summary,row.id);
   for(const task of row.tasks)enqueue(env[{'Legal':'ITM_LEGAL_EMAIL','Finanzas':'ITM_FINANZAS_EMAIL','TI y Seguridad':'ITM_TI_EMAIL','Dirección de Obra':'ITM_DIRECCION_EMAIL'}[task.role]],'['+row.folio+'] Revisión asignada',task.label+'\n'+task.evidence+'\n'+link);
 }else if(!['save','format','ack','ask','answer','legalReview','notice'].includes(input.action)){
   enqueue(row.owner,'['+row.folio+'] Actualización de solicitud',row.status+'\n'+link);
   if(input.action==='advance')enqueue(env.ITM_DIRECCION_EMAIL,'['+row.folio+'] Autorización pendiente',link);
 }
}
function transact(user,input){
 db.exec('BEGIN IMMEDIATE');
 try{
   const state=getState();
   let file;
   if(['save','send'].includes(input.action)&&input.data?.file){
     if(input.data.file.data)file=validateQuote(input.data.file);
     else {
       const existing=state.rows.find(r=>r.id===input.id&&r.owner===user.email);
       const stored=existing&&stmt('SELECT name,type FROM attachments WHERE request_id=?').get(existing.id);
       if(!stored)throw fail('Selecciona la cotización nuevamente.');
       input.data.file={...stored,data:'retained'};
     }
   }
   const result=command(state,user,input);
   if(result.row){
     if(file)result.row.file={name:file.name,type:file.type};
     else if(result.row.file)delete result.row.file.data;
     const r=result.row;
     stmt('INSERT INTO requests VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET folio=excluded.folio,payload=excluded.payload').run(r.id,r.owner,r.folio??null,json(r));
     if(file)stmt('INSERT INTO attachments VALUES(?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET name=excluded.name,type=excluded.type,bytes=excluded.bytes').run(r.id,file.name,file.type,file.bytes);
   }
   if(input.action==='params')stmt('INSERT INTO params VALUES(?,?)').run(state.params.version,json(state.params));
   if(['params','notice'].includes(input.action))for(const n of state.notices??[])stmt('INSERT INTO notices VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(n.id,json(n));
   if(['provider','send'].includes(input.action))for(const p of state.providers)stmt('INSERT INTO providers VALUES(?,?) ON CONFLICT(tax) DO UPDATE SET payload=excluded.payload').run(p.tax,json(p));
   if(input.action==='clearDemo')for(const r of state.rows.filter(r=>r.demo))stmt('UPDATE requests SET payload=? WHERE id=?').run(json(r),r.id);
   for(const e of state.audit)stmt('INSERT INTO audit(payload) VALUES(?)').run(json(e));
   queueNotice(input,result.row,state);
   db.exec('COMMIT');return result;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
const files={'/':'index.html','/app.js':'app.js','/engine.js':'engine.js','/config.js':'config.js','/demo.js':'demo.js','/workflow.js':'workflow.js','/styles.css':'styles.css','/logo.png':'logo.png'};
const mime={html:'text/html; charset=utf-8',js:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8',png:'image/png'};
const server=createServer(async(req,res)=>{
 try{
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Referrer-Policy','same-origin');
   res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
   const url=new URL(req.url,'http://localhost'),path=url.pathname,{user,hash}=session(req);
   if(req.method==='GET'&&Object.hasOwn(files,path)){
     const file=files[path];res.writeHead(200,{'Content-Type':mime[file.split('.').pop()]});const contents=await readFile(join(root,'dist',file));res.end(path==='/'?contents.toString().replace('name="itm-mode" content="demo"','name="itm-mode" content="server"'):contents);return;
   }
   if(req.method==='POST'&&(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host&&req.headers.origin!==env.ITM_PUBLIC_URL))throw fail('Origen no permitido.',403);
   if(req.method==='GET'&&path==='/api/mode')return jsonResponse(res,{demo:false,user});
   if(req.method==='POST'&&path==='/api/login'){
     const {email:raw,password}=await body(req),email=emailOf(raw);
     const key=digest(email), stored=stmt('SELECT * FROM failures WHERE key=?').get(key);
     if(stored?.until>now()&&stored.count>=5)throw fail('Demasiados intentos. Intenta nuevamente en 15 minutos.',429);
     const row=stmt('SELECT * FROM users WHERE email=?').get(email);
     const [salt,expected]=(row?.password||'0:').split(':');
     const candidate=passwordHash(typeof password==='string'?password.slice(0,129):'',salt).split(':')[1];
     if(!row||!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(candidate,'hex'))){
       stmt('INSERT OR REPLACE INTO failures VALUES(?,?,?)').run(key,stored?.until>now()?stored.count+1:1,now()+900000);
       throw fail('Correo o contraseña incorrectos.',401);
     }
     stmt('DELETE FROM failures WHERE key=?').run(key);
     stmt('DELETE FROM sessions WHERE expires<=?').run(now());
     const token=randomBytes(32).toString('hex');
     stmt('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),row.email,now()+28800000);
     return jsonResponse(res,{user:{email:row.email,name:row.name,roles:parse(row.roles)}},200,{'Set-Cookie':cookie(token,28800)});
   }
   if(!user)throw fail('Inicia sesión para continuar.',401);
   if(req.method==='POST'&&path==='/api/logout'){
     stmt('DELETE FROM sessions WHERE hash=?').run(hash);return jsonResponse(res,{},200,{'Set-Cookie':cookie('',0)});
   }
   if(req.method==='GET'&&path==='/api/state'){
     const state=getState();state.rows=state.rows.filter(r=>canSee(r,user));
     if(user.roles.includes('Administrador'))state.audit=list('SELECT payload FROM audit ORDER BY id');
     return jsonResponse(res,{state});
   }
   if(req.method==='GET'&&path==='/api/file'){
     const id=url.searchParams.get('id'),item=stmt('SELECT payload FROM requests WHERE id=?').get(id);
     const file=item&&canSee(parse(item.payload),user)&&stmt('SELECT * FROM attachments WHERE request_id=?').get(id);
     if(!file)throw fail('Archivo no disponible.',404);
     res.writeHead(200,{'Content-Type':file.type,'Cache-Control':'no-store','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replaceAll("'",'%27')});res.end(Buffer.from(file.bytes));return;
   }
   if(req.method==='POST'&&path==='/api/accumulated'){
     if(!user.roles.includes('Solicitante'))throw fail('Acceso restringido.',403);
     const {work,tax,id}=await body(req),state=getState();
     if(typeof tax!=='string'||!Object.hasOwn(state.params.works,work))throw fail('Selecciona una obra y un proveedor.');
     return jsonResponse(res,{previous:accumulate(state.rows,{work,tax,id:state.rows.some(r=>r.owner===user.email&&!r.folio&&r.id===id)?id:null},state.params)});
   }
   if(req.method==='POST'&&path==='/api/command'){
     const input=await body(req);
     if(!input||!['save','send','params','provider','clearDemo','review','instrument','authorize','advance','cancel','format','ack','ask','answer','legalReview','notice'].includes(input.action))throw fail('Acción no disponible.');
     try{return jsonResponse(res,transact(user,input));}catch(error){throw fail(error.message);}
   }
   if(req.method==='POST'&&path==='/api/users'){
     if(!user.roles.includes('Administrador'))throw fail('Acceso restringido.',403);
     const input=await body(req);createUser(input);
     stmt('INSERT INTO audit(payload) VALUES(?)').run(json({action:'Usuario creado',at:new Date().toISOString(),user:user.email,after:{email:emailOf(input.email),roles:input.roles}}));
     return jsonResponse(res,{});
   }
   throw fail('Ruta no disponible.',404);
 }catch(error){if(!res.headersSent)jsonResponse(res,{error:error.status?error.message:'Ocurrió un error en el servidor.'},error.status||500);else res.end();if(!error.status)console.error(error);}
});
let sending=false;
async function dispatch(){
 if(sending||!env.SMTP_HOST)return;
 sending=true;
 try{
   const {default:nodemailer}=await import('nodemailer');
   const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_SECURE==='1',auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}:undefined});
   for(const row of stmt('SELECT * FROM outbox WHERE sent IS NULL AND next<=? ORDER BY id LIMIT 10').all(now())){
     const {requestId,...msg}=parse(row.payload);
     try{
       const quote=requestId&&stmt('SELECT * FROM attachments WHERE request_id=?').get(requestId);
       await transport.sendMail({...msg,from:env.SMTP_FROM,attachments:quote?[{filename:quote.name,content:Buffer.from(quote.bytes)}]:[]});
       stmt('UPDATE outbox SET sent=?,last_error=NULL WHERE id=?').run(now(),row.id);
     }catch(error){stmt('UPDATE outbox SET attempts=attempts+1,next=?,last_error=? WHERE id=?').run(now()+Math.min(3600000,60000*2**row.attempts),String(error.code||'ERROR_SMTP'),row.id);}
   }
 }catch(error){console.error('Cola SMTP:',error.code||error.message);}finally{sending=false;}
}
setInterval(dispatch,30000).unref();
server.listen(Number(env.PORT||3000),()=>console.log('Instrumentos de Compra en el puerto '+server.address().port));
