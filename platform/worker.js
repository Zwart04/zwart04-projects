import {publicForm,publishForm} from './forms.js';
import {PRODUCTS} from './definitions.js';
import {uid,random,digest,equal,validEmail,validPassword,passwordHash,verifyPassword,recoveryHash,session,newSession,clearCookie,limit} from './auth.js';
import {ApiError,fail,body,access,moduleSpec,getRecord,saveRecord,deleteRecord,present,audit,auditStatement} from './data.js';
import {runWorkflow} from './workflows.js';
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const safeUser=u=>({id:u.id,name:u.name,email:u.email});
const workspaces=(env,id,product)=>env.DB.prepare('SELECT w.id,w.name,w.product,m.role FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? AND w.product=? ORDER BY w.created_at').bind(id,product).all();
export async function handle(request,env) {
 const url=new URL(request.url),path=url.pathname,method=request.method,product=PRODUCTS[request.headers.get('X-Zwart-Product')];
 if(!product)fail(404,'Produk tidak dikenal.');
 if(path==='/api/health') {await env.DB.prepare('SELECT count(*) AS n FROM workspaces').first();return json({ok:true,version:'2.0.0',product:product.id,storage:'D1'});}
 if(path==='/api/config')return json({product:{...product,sources:undefined}});
 const publicMatch=path.match(/^\/api\/public-forms\/([a-f0-9]{64})$/);if(publicMatch)return json(await publicForm(request,env,product,publicMatch[1]));
 const mutating=!['GET','HEAD'].includes(method);
 if(path==='/api/ingest'&&method==='POST') {
  if(product.id!=='aquapure')fail(404,'Endpoint tidak tersedia.');
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';if(!/^[a-f0-9]{64}$/.test(token))fail(401,'API key sensor diperlukan.');
  const key=await env.DB.prepare("SELECT k.workspace_id,w.owner_id FROM sensor_keys k JOIN workspaces w ON w.id=k.workspace_id WHERE k.hash=? AND w.product='aquapure'").bind(await digest(token)).first();
  if(!key)fail(401,'API key tidak valid.');if(!await limit(env,'sensor:'+key.workspace_id,60,60))fail(429,'Batas ingestion sensor 60 request per menit.');
  const actor=await env.DB.prepare('SELECT id,name FROM users WHERE id=?').bind(key.owner_id).first();
  return json({record:await saveRecord(env,key.workspace_id,actor,moduleSpec(product,'water_samples'),await body(request))},201);
 }
 if(mutating&&request.headers.get('origin')!==request.headers.get('X-App-Origin'))fail(403,'Origin request tidak valid.');
 const user=await session(env,request);
 if(path==='/api/auth/session'&&method==='GET')return json(user?{user:safeUser(user),csrf:user.csrf,workspaces:(await workspaces(env,user.id,product.id)).results}:{user:null,workspaces:[]});
 if(path.startsWith('/api/auth/')&&['register','login','recover'].includes(path.split('/').at(-1))) {
  if(method!=='POST')fail(405,'Gunakan POST.');
  if(!await limit(env,'auth:'+request.headers.get('CF-Connecting-IP')+':'+path,10,900))fail(429,'Terlalu banyak percobaan. Coba lagi setelah 15 menit.');
  const input=await body(request),email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  if(!validEmail(email))fail(422,'Alamat email tidak valid.');
  if(path.endsWith('/register')) {
   if(!validPassword(input.password))fail(422,'Password harus 12–128 karakter.');
   if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)fail(422,'Nama wajib diisi (maksimum 80 karakter).');
   const id=uid(),recoveryCode=random(),name=input.name.trim();
   const hash=await passwordHash(input.password,env.PEPPER),recovery=await recoveryHash(recoveryCode,env.PEPPER);
   try{await env.DB.prepare('INSERT INTO users(id,email,name,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?)').bind(id,email,name,hash,recovery,Date.now()).run();}catch(error){if(/unique/i.test(error.message))fail(409,'Email sudah terdaftar. Gunakan halaman masuk.');throw error;}
   const created={id,email,name},auth=await newSession(env,created);return json({user:created,csrf:auth.csrf,recoveryCode,workspaces:[]},201,auth.headers);
  }
  const existing=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if(path.endsWith('/login')) {
   if(!existing||!await verifyPassword(input.password,existing.password_hash,env.PEPPER))fail(401,'Email atau password tidak sesuai.');
   const auth=await newSession(env,existing);return json({user:safeUser(existing),csrf:auth.csrf,workspaces:(await workspaces(env,existing.id,product.id)).results},200,auth.headers);
  }
  if(!validPassword(input.password))fail(422,'Password baru harus 12–128 karakter.');
  if(!existing||typeof input.code!=='string'||!equal(await recoveryHash(input.code.trim(),env.PEPPER),existing.recovery_hash))fail(401,'Email atau kode pemulihan tidak sesuai.');
  const recoveryCode=random();await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=?').bind(await passwordHash(input.password,env.PEPPER),await recoveryHash(recoveryCode,env.PEPPER),existing.id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(existing.id)]);
  const auth=await newSession(env,existing);return json({user:safeUser(existing),csrf:auth.csrf,recoveryCode,workspaces:(await workspaces(env,existing.id,product.id)).results},200,auth.headers);
 }
 if(!user)fail(401,'Masuk terlebih dahulu.');
 if(mutating&&!equal(request.headers.get('X-CSRF-Token'),user.csrf))fail(403,'Session berubah. Muat ulang halaman.');
 if(!await limit(env,'account:'+user.id+':'+(mutating?'write':'read'),mutating?100:300,60))fail(429,'Terlalu banyak request. Tunggu sebentar.');
 if(path==='/api/auth/logout'&&method==='POST') {await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();return json({ok:true},200,{'Set-Cookie':clearCookie});}
 if(path==='/api/auth/profile'&&method==='PATCH') {
  const input=await body(request);if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)fail(422,'Nama tidak valid.');
  await env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(input.name.trim(),user.id).run();return json({user:{...safeUser(user),name:input.name.trim()}});
 }
 if(path==='/api/auth/password'&&method==='POST') {
  const input=await body(request),stored=await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
  if(!await verifyPassword(input.current,stored.password_hash,env.PEPPER))fail(401,'Password saat ini tidak sesuai.');if(!validPassword(input.password))fail(422,'Password baru harus 12–128 karakter.');
  await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await passwordHash(input.password,env.PEPPER),user.id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
  const auth=await newSession(env,user);return json({ok:true,csrf:auth.csrf},200,auth.headers);
 }
 if(path==='/api/workspaces'&&method==='POST') {
  const input=await body(request);if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)fail(422,'Nama workspace wajib diisi.');
  const count=await env.DB.prepare('SELECT count(*) AS n FROM workspaces WHERE owner_id=?').bind(user.id).first();if(count.n>=20)fail(409,'Maksimum 20 workspace per akun.');
  const id=uid();await env.DB.batch([env.DB.prepare('INSERT INTO workspaces(id,product,name,owner_id,created_at) VALUES(?,?,?,?,?)').bind(id,product.id,input.name.trim(),user.id,Date.now()),env.DB.prepare('INSERT INTO members(workspace_id,user_id,role) VALUES(?,?,?)').bind(id,user.id,'owner'),auditStatement(env,id,user,'workspace.create',null)]);
  return json({workspace:{id,name:input.name.trim(),product:product.id,role:'owner'}},201);
 }
 if(path==='/api/invitations/accept'&&method==='POST') {
  const input=await body(request);if(typeof input.token!=='string')fail(422,'Token undangan tidak valid.');
  const invite=await env.DB.prepare('SELECT i.*,w.product FROM invitations i JOIN workspaces w ON w.id=i.workspace_id WHERE i.token_hash=? AND i.expires_at>? AND i.accepted_at IS NULL').bind(await digest(input.token),Date.now()).first();
  if(!invite||invite.product!==product.id||invite.email!==user.email)fail(403,'Undangan tidak valid, kadaluarsa, atau ditujukan untuk email lain.');
  const member=await env.DB.prepare('SELECT role FROM members WHERE workspace_id=? AND user_id=?').bind(invite.workspace_id,user.id).first();
  if(!member)await env.DB.batch([env.DB.prepare('INSERT INTO members(workspace_id,user_id,role) VALUES(?,?,?)').bind(invite.workspace_id,user.id,invite.role),env.DB.prepare('UPDATE invitations SET accepted_at=? WHERE id=?').bind(Date.now(),invite.id),auditStatement(env,invite.workspace_id,user,'invitation.accept',null)]);
  return json({workspaces:(await workspaces(env,user.id,product.id)).results});
 }
 const match=path.match(/^\/api\/workspaces\/([^/]+)(?:\/(.*))?$/);if(!match)fail(404,'Endpoint tidak ditemukan.');
 const workspace=match[1],route=match[2]||'';
 const quizSubmit=route==='actions/submit-quiz';const ws=await access(env,user,workspace,product.id,mutating&&!quizSubmit);
 if(!route&&method==='PATCH') {await access(env,user,workspace,product.id,true,true);const input=await body(request);if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)fail(422,'Nama workspace tidak valid.');await env.DB.prepare('UPDATE workspaces SET name=? WHERE id=?').bind(input.name.trim(),workspace).run();await audit(env,workspace,user,'workspace.rename',null);return json({workspace:{...ws,name:input.name.trim()}});}
 if(route==='summary'&&method==='GET') {
  const counts=await env.DB.prepare('SELECT kind,status,count(*) AS count FROM records WHERE workspace_id=? AND deleted_at IS NULL GROUP BY kind,status').bind(workspace).all();
  const recent=await env.DB.prepare('SELECT id,kind,title,status,updated_at FROM records WHERE workspace_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 6').bind(workspace).all();
  const auditRows=await env.DB.prepare('SELECT a.action,a.detail,a.created_at,u.name AS actor FROM audit a JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=? ORDER BY a.created_at DESC LIMIT 8').bind(workspace).all();
  const financial=await env.DB.prepare("SELECT kind,sum(COALESCE(json_extract(data,'$.amount'),0)) AS amount FROM records WHERE workspace_id=? AND deleted_at IS NULL AND (kind='expenses' OR kind='invoices' AND status='paid') GROUP BY kind").bind(workspace).all();
  const trend=await env.DB.prepare("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') AS date,count(*) AS count FROM records WHERE workspace_id=? AND deleted_at IS NULL AND created_at>? GROUP BY date ORDER BY date").bind(workspace,Date.now()-7*86400000).all();
  return json({counts:counts.results,recent:recent.results,activity:auditRows.results,financial:financial.results,trend:trend.results,workspace:{id:ws.id,name:ws.name,role:ws.role}});
 }
 if(route==='options'&&method==='GET') {const rows=await env.DB.prepare('SELECT id,kind,title FROM records WHERE workspace_id=? AND deleted_at IS NULL ORDER BY title LIMIT 2500').bind(workspace).all();return json({records:rows.results});}
 if(route==='market'&&method==='GET') {
  if(product.id!=='stockgenie')fail(404,'Endpoint tidak tersedia.');
  const quotes={},errors=[];
  await Promise.all(['BTC','ETH','SOL'].map(async symbol=>{try{const response=await fetch('https://api.exchange.coinbase.com/products/'+symbol+'-USD/ticker',{headers:{Accept:'application/json'},cf:{cacheTtl:30,cacheEverything:true},signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json(),price=Number(data.price);if(!Number.isFinite(price)||price<=0)throw new Error('Invalid quote');quotes[symbol]={price:Math.round(price*100),time:data.time||null};}catch{errors.push(symbol);}}));
  return json({quotes,errors,source:'Coinbase Exchange',fetchedAt:new Date().toISOString()},Object.keys(quotes).length?200:503);
 }
 if(route==='currency'&&method==='GET') {
  if(!['daily-apps','stockgenie'].includes(product.id))fail(404,'Endpoint tidak tersedia.');
  const base=url.searchParams.get('base')||'USD';if(!/^[A-Z]{3}$/.test(base))fail(422,'Mata uang tidak valid.');
  try {const response=await fetch('https://api.frankfurter.app/latest?from='+base,{cf:{cacheTtl:3600,cacheEverything:true},signal:AbortSignal.timeout(12000)});if(!response.ok)fail(503,'Feed kurs belum tersedia.');const data=await response.json();if(!data.rates||!data.date)fail(503,'Feed kurs tidak valid.');return json({base:data.base,date:data.date,rates:{...data.rates,[base]:1},source:'Frankfurter / ECB'});}catch{fail(503,'Feed kurs gagal. Tidak ada kurs simulasi.');}
 }
 if(route==='members'&&method==='GET') {const rows=await env.DB.prepare('SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.role,u.name').bind(workspace).all();return json({members:rows.results});}
 if(route==='members'&&method==='PATCH') {await access(env,user,workspace,product.id,true,true);const input=await body(request);if(!['editor','viewer'].includes(input.role))fail(422,'Peran tidak valid.');const result=await env.DB.prepare("UPDATE members SET role=? WHERE workspace_id=? AND user_id=? AND role<>'owner'").bind(input.role,workspace,input.id).run();if(!result.meta.changes)fail(404,'Anggota tidak ditemukan.');await audit(env,workspace,user,'member.role',input.id,input.role);return json({ok:true});}
 if(route.startsWith('members/')&&method==='DELETE') {await access(env,user,workspace,product.id,true,true);const id=route.split('/')[1];const result=await env.DB.prepare("DELETE FROM members WHERE workspace_id=? AND user_id=? AND role<>'owner'").bind(workspace,id).run();if(!result.meta.changes)fail(404,'Anggota tidak ditemukan.');await audit(env,workspace,user,'member.remove',id);return json({ok:true});}
 if(route==='invitations'&&method==='POST') {
  await access(env,user,workspace,product.id,true,true);const input=await body(request);if(!validEmail(input.email)||!['editor','viewer'].includes(input.role))fail(422,'Email dan peran undangan tidak valid.');
  const token=random();await env.DB.prepare('INSERT INTO invitations(id,workspace_id,email,role,token_hash,expires_at) VALUES(?,?,?,?,?,?)').bind(uid(),workspace,input.email.toLowerCase().trim(),input.role,await digest(token),Date.now()+7*86400000).run();await audit(env,workspace,user,'member.invite',null,input.role);
  return json({url:request.headers.get('X-App-Origin')+'/?invite='+token,expiresAt:Date.now()+7*86400000});
 }
 if(route==='audit'&&method==='GET') {const rows=await env.DB.prepare('SELECT a.*,u.name AS actor FROM audit a JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=? ORDER BY a.created_at DESC LIMIT 100').bind(workspace).all();return json({entries:rows.results});}
 if(route==='export'&&method==='GET') {const rows=await env.DB.prepare('SELECT * FROM records WHERE workspace_id=? AND deleted_at IS NULL ORDER BY kind,created_at').bind(workspace).all();return json({product:product.id,workspace:{name:ws.name},exportedAt:new Date().toISOString(),records:await Promise.all(rows.results.map(r=>present(env,r,ws.role)))});}
 if(route==='ai/history'&&method==='GET') {const rows=await env.DB.prepare('SELECT id,prompt,answer,model,created_at FROM ai_messages WHERE workspace_id=? AND user_id=? ORDER BY created_at DESC LIMIT 30').bind(workspace,user.id).all();return json({messages:rows.results.reverse()});}
 if(route==='ai'&&method==='POST') {
  const input=await body(request);if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>2500)fail(422,'Pesan harus 1–2500 karakter.');
  if(!await limit(env,'ai:user:'+user.id,5,86400)||!await limit(env,'ai:global',40,86400))fail(429,'Batas AI gratis hari ini tercapai. Coba lagi besok.');
  if(!env.AI)fail(503,'Workers AI belum terhubung.');
  let answer;
  try {const response=await env.AI.run('@cf/meta/llama-3.2-3b-instruct',{messages:[{role:'system',content:'Anda asisten '+product.name+'. Jawab dalam bahasa Indonesia yang jelas. Konteks hanya berasal dari teks pengguna. Jangan mengaku mengakses sensor, pembayaran, database, internet atau dokumen yang tidak diberikan. Jangan membuat angka, transaksi, sumber atau kesimpulan hukum/medis fiktif. Nyatakan ketidakpastian jika perlu.'},{role:'user',content:input.prompt}],max_tokens:512,temperature:0.3});answer=response.response;if(typeof answer!=='string'||!answer.trim())throw new Error('Empty model response');}catch{fail(503,'Layanan AI sedang gagal atau kuotanya tidak tersedia. Pesan tidak diganti dengan jawaban simulasi.');}
  await env.DB.prepare('INSERT INTO ai_messages(id,workspace_id,user_id,prompt,answer,model,created_at) VALUES(?,?,?,?,?,?,?)').bind(uid(),workspace,user.id,input.prompt,answer,'@cf/meta/llama-3.2-3b-instruct',Date.now()).run();return json({answer,model:'Llama 3.2 3B · Cloudflare Workers AI'});
 }
 if(route==='sensor-key'&&method==='POST') {if(product.id!=='aquapure')fail(404,'Endpoint tidak tersedia.');await access(env,user,workspace,product.id,true,true);const key=random();await env.DB.batch([env.DB.prepare('DELETE FROM sensor_keys WHERE workspace_id=?').bind(workspace),env.DB.prepare('INSERT INTO sensor_keys(hash,workspace_id,created_at) VALUES(?,?,?)').bind(await digest(key),workspace,Date.now())]);return json({key});}
 if(route==='trash'&&method==='GET') {const rows=await env.DB.prepare('SELECT id,kind,title,deleted_at FROM records WHERE workspace_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100').bind(workspace).all();return json({records:rows.results});}
 if(route.startsWith('restore/')&&method==='POST') {const id=route.split('/')[1];const row=await env.DB.prepare('SELECT id FROM records WHERE workspace_id=? AND id=? AND deleted_at IS NOT NULL').bind(workspace,id).first();if(!row)fail(404,'Data tidak ditemukan.');try{await env.DB.prepare('UPDATE records SET deleted_at=NULL,version=version+1 WHERE workspace_id=? AND id=?').bind(workspace,id).run();}catch{fail(409,'Data unik sudah digunakan oleh record aktif.');}await audit(env,workspace,user,'record.restore',id);return json({ok:true});}
 if(route==='actions/publish-form'&&method==='POST'){const input=await body(request);return json(await publishForm(env,workspace,user,input.id,request.headers.get('X-App-Origin')));}
 if(route.startsWith('actions/')&&method==='POST')return json(await runWorkflow(env,workspace,user,product,route.split('/')[1],await body(request)));
 const resource=route.match(/^records\/([^/]+)(?:\/([^/]+))?$/);
 if(resource) {
  const kind=resource[1],id=resource[2],module=moduleSpec(product,kind);
  if(method==='GET') {
   if(id)return json({record:await present(env,await getRecord(env,workspace,id,kind),ws.role)});
   const page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1)),search=(url.searchParams.get('q')||'').slice(0,100),status=url.searchParams.get('status')||'';
   const where='workspace_id=? AND kind=? AND deleted_at IS NULL AND title LIKE ?'+(status?' AND status=?':'');const args=[workspace,kind,'%'+search+'%',...(status?[status]:[])];
   const rows=await env.DB.prepare('SELECT * FROM records WHERE '+where+' ORDER BY updated_at DESC,id LIMIT 30 OFFSET ?').bind(...args,(page-1)*30).all();const count=await env.DB.prepare('SELECT count(*) AS n FROM records WHERE '+where).bind(...args).first();
   return json({records:await Promise.all(rows.results.map(r=>present(env,r,ws.role))),total:count.n,page,pages:Math.ceil(count.n/30)});
  }
  if(method==='POST'&&!id) {const count=await env.DB.prepare('SELECT count(*) AS n FROM records WHERE workspace_id=? AND deleted_at IS NULL').bind(workspace).first();if(count.n>=10000)fail(409,'Batas workspace 10.000 record tercapai.');return json({record:await saveRecord(env,workspace,user,module,await body(request))},201);}
  if(method==='PUT'&&id)return json({record:await saveRecord(env,workspace,user,module,await body(request),id)});
  if(method==='DELETE'&&id)return json(await deleteRecord(env,workspace,user,product,id));
 }
 fail(404,'Endpoint tidak ditemukan.');
}
export default {
 async fetch(request,env) {
  try {return await handle(request,env);}catch(error) {if(error instanceof ApiError)return json({error:error.message},error.status);const id=uid();console.error('backend-request-failed',id,error.name);return json({error:'Server tidak dapat menyelesaikan request. ID: '+id},500);}
 },
 async scheduled(event,env) {await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()),env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(Date.now()-86400000),env.DB.prepare('DELETE FROM invitations WHERE expires_at<?').bind(Date.now()-30*86400000)]);}
};
