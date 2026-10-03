import {validateFields} from './forms.js';
import {uid,random,digest} from './auth.js';
export class ApiError extends Error { constructor(status,message) { super(message);this.status=status; } }
export const fail=(status,message)=>{throw new ApiError(status,message);};
export async function body(request) {
 if(!request.headers.get('content-type')?.includes('application/json')) fail(415,'Gunakan Content-Type application/json.');
 const raw=await request.text();if(new TextEncoder().encode(raw).length>350000) fail(413,'Data terlalu besar (maksimum 350 KB).');
 try {const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value)) fail(400,'JSON harus berupa object.');return value;} catch(error) {if(error instanceof ApiError)throw error;fail(400,'JSON tidak valid.');}
}
export async function access(env,user,workspace,product,write=false,owner=false) {
 const row=await env.DB.prepare('SELECT w.*,m.role FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE w.id=? AND w.product=? AND m.user_id=?').bind(workspace,product,user.id).first();
 if(!row)fail(404,'Workspace tidak ditemukan.');if(owner&&row.role!=='owner')fail(403,'Hanya owner yang dapat melakukan ini.');if(write&&row.role==='viewer')fail(403,'Peran viewer hanya dapat membaca data.');return row;
}
export function moduleSpec(product,kind) { const m=product.modules.find(m=>m.key===kind&&!m.tool);if(!m)fail(404,'Modul tidak ditemukan.');return m; }
export async function getRecord(env,workspace,id,kind) {
 const row=await env.DB.prepare('SELECT * FROM records WHERE workspace_id=? AND id=? AND deleted_at IS NULL').bind(workspace,id).first();
 if(!row||kind&&row.kind!==kind)fail(404,'Data tidak ditemukan.');row.data=JSON.parse(row.data);return row;
}
export const auditStatement=(env,workspace,user,action,id,detail='')=>env.DB.prepare('INSERT INTO audit(id,workspace_id,actor_id,action,record_id,detail,created_at) VALUES(?,?,?,?,?,?,?)').bind(uid(),workspace,user.id,action,id,detail.slice(0,300),Date.now());
export async function audit(env,workspace,user,action,id,detail='') { await auditStatement(env,workspace,user,action,id,detail).run(); }
export async function validate(env,workspace,m,input,previous=null) {
 const data={};
 for(const field of m.fields) {
  let value=input[field.key];const empty=value===undefined||value===null||value==='';
  if(empty) {if(field.required)fail(422,field.label+' wajib diisi.');data[field.key]=['lat','lng','temperature','turbidity'].includes(field.key)||field.type==='number'&&field.min>0?null:['number','money'].includes(field.type)?0:['json','items','quiz'].includes(field.type)?[]:'';continue;}
  if(['number','money'].includes(field.type)) {
   if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12)fail(422,field.label+' harus angka yang valid.');
   if(field.type==='money'&&(!Number.isSafeInteger(value)||value<0))fail(422,field.label+' harus berupa minor currency unit nonnegatif.');
   if(field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max)fail(422,field.label+' di luar rentang.');
  } else if(['json','items','quiz'].includes(field.type)) {
   if(value===null||typeof value!=='object'||JSON.stringify(value).length>150000)fail(422,field.label+' harus JSON dengan ukuran wajar.');
   if(field.type==='items') {
    if(!Array.isArray(value)||value.length<1||value.length>20)fail(422,'Tambahkan 1–20 item.');
    const quantities=new Map();
    for(const item of value) {if(typeof item.product_id!=='string'||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100000)fail(422,'Produk dan jumlah item tidak valid.');quantities.set(item.product_id,(quantities.get(item.product_id)||0)+item.quantity);}
    value=[];
    for(const [product_id,quantity] of quantities) {const product=await getRecord(env,workspace,product_id,'products');value.push({product_id,quantity,price:product.data.price,title:product.title});}
   }
   if(field.type==='quiz') {
    if(!Array.isArray(value)||!value.length||value.length>50)fail(422,'Kuis memerlukan 1–50 pertanyaan.');
    value=value.map(q=>{if(typeof q.question!=='string'||q.question.length>2000||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(s=>typeof s!=='string'||s.length>1000)||!Number.isInteger(q.correct)||q.correct<0||q.correct>=q.options.length)fail(422,'Pertanyaan, pilihan dan kunci jawaban kuis tidak valid.');return {question:q.question,options:q.options,correct:q.correct};});
   }
  } else {
   if(typeof value!=='string')fail(422,field.label+' harus berupa teks.');
   const max=['textarea','code'].includes(field.type)?100000:500;
   if(value.length>max)fail(422,field.label+' terlalu panjang.');
   if(!['textarea','code'].includes(field.type))value=value.trim();
   if(field.required&&!value.trim())fail(422,field.label+' wajib diisi.');
   if(field.type==='select'&&!field.options.includes(value))fail(422,'Pilihan '+field.label+' tidak valid.');
   if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail(422,'Alamat email tidak valid.');
   if(field.type==='url') {try {const url=new URL(value);if(!['http:','https:'].includes(url.protocol))fail(422,'URL harus HTTP/HTTPS.');}catch{fail(422,'URL tidak valid.');}}
   if(field.type==='date') {if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail(422,'Tanggal tidak valid.');}
   if(field.type==='datetime') {if(!Number.isFinite(Date.parse(value)))fail(422,'Waktu tidak valid.');value=new Date(value).toISOString();}
   if(field.type==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail(422,'Jam tidak valid.');
   if(field.type==='color'&&!/^#[a-f0-9]{6}$/i.test(value))fail(422,'Warna harus HEX enam digit.');
   if(field.type==='ref'&&value)await getRecord(env,workspace,value,field.ref);
  }
  data[field.key]=value;
 }
 if(m.key==='checkins'&&data.date>new Date(Date.now()+14*3600000).toISOString().slice(0,10))fail(422,'Check-in tidak boleh di masa depan.');
 if(m.key==='routine_runs'){const routine=await getRecord(env,workspace,data.routine_id,'routines'),count=routine.data.steps.split('\n').filter(s=>s.trim()).length;if(!Array.isArray(data.completed_steps)||data.completed_steps.some(i=>!Number.isInteger(i)||i<0||i>=count)||new Set(data.completed_steps).size!==data.completed_steps.length)fail(422,'Indeks langkah rutinitas tidak valid.');if(input.status==='done'&&data.completed_steps.length!==count)fail(422,'Selesaikan seluruh langkah terlebih dahulu.');}
 if(m.key==='levels'&&(!Number.isInteger(data.width)||!Number.isInteger(data.height)||!Array.isArray(data.cells)||data.cells.length>data.width*data.height||data.cells.some(n=>!Number.isInteger(n)||n<0||n>7)))fail(422,'Level memerlukan dimensi integer dan array tile 0–7.');
 if(m.key==='forms')data.fields=validateFields(data.fields);
 if(m.key==='form_responses')fail(403,'Respons form hanya dibuat melalui form publik.');
 if(m.key==='products'&&!Number.isInteger(data.stock))fail(422,'Stok harus bilangan bulat.');
 if(data.start&&data.end&&Date.parse(data.start)>=Date.parse(data.end))fail(422,'Waktu selesai harus setelah waktu mulai.');
 if(data.start_date&&data.end_date&&data.start_date>data.end_date)fail(422,'Tanggal pulang harus setelah tanggal berangkat.');
 if(m.key==='campaigns'&&(data.sales>data.leads||data.leads>data.visits))fail(422,'Transaksi ≤ lead ≤ kunjungan.');
 if(m.key==='thresholds'&&data.minimum>data.maximum)fail(422,'Ambang minimum harus ≤ maksimum.');
 if(m.key==='files'&&(/(^|\/)\.\.(\/|$)/.test(data.path)||data.path.startsWith('/')||data.path.includes('\\')))fail(422,'Gunakan path relatif tanpa .. atau backslash.');
 if(m.key==='letters') {if(previous&&Date.parse(previous.data.unlock_at)>Date.now())fail(409,'Surat terkunci tidak dapat diedit sebelum waktu buka.');if(!previous&&Date.parse(data.unlock_at)<=Date.now())fail(422,'Waktu buka harus di masa depan.');}
 if(m.key==='orders') {data.total=data.items.reduce((sum,item)=>sum+item.price*item.quantity,0);if(!Number.isSafeInteger(data.total))fail(422,'Total pesanan terlalu besar.');if(previous&&previous.status!=='draft')fail(409,'Item pesanan hanya dapat diedit pada status draft.');}
 if(m.key==='attempts')fail(422,'Kirim jawaban melalui Ruang belajar; nilai dihitung server.');
 const status=input.status||previous?.status||m.statuses[0];if(!m.statuses.includes(status))fail(422,'Status tidak valid.');
 if(m.key==='orders'&&status!=='draft'||m.key==='stock_movements'&&status!=='pending')fail(422,'Status diproses melalui aksi workflow.');
 return {data,status,title:data.name};
}
export async function encryptLetter(value,secret) {
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('letters:'+secret)),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));
 return {iv:Array.from(iv),cipher:Array.from(encrypted)};
}
export async function decryptLetter(value,secret) {
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('letters:'+secret)),'AES-GCM',false,['decrypt']);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv)},key,new Uint8Array(value.cipher)));
}
export async function present(env,row,role) {
 if(typeof row.data==='string')row.data=JSON.parse(row.data);
  if(row.kind==='quizzes'&&role==='viewer')row.data.questions=row.data.questions.map(({correct,...question})=>question);
 if(row.kind==='letters') {const locked=Date.parse(row.data.unlock_at)>Date.now();row.data.body=locked?'':await decryptLetter(row.data.body,env.PEPPER);row.data.locked=locked;}
 const ids=Object.entries(row.data).filter(([key,value])=>key.endsWith('_id')&&typeof value==='string'&&value).map(([,value])=>value);
 row.referenceNames={};if(ids.length){const names=await env.DB.prepare('SELECT id,title FROM records WHERE workspace_id=? AND deleted_at IS NULL AND id IN ('+ids.map(()=>'?').join(',')+')').bind(row.workspace_id,...ids).all();row.referenceNames=Object.fromEntries(names.results.map(r=>[r.id,r.title]));}
 return row;
}
export function validationReceipt(env,workspace,action,id,condition,args,result={}) {
 return env.DB.prepare('INSERT INTO workflow_keys(workspace_id,action,idempotency_key,result,created_at,valid) VALUES(?,?,?,?,?,CASE WHEN '+condition+' THEN 1 ELSE 0 END)').bind(workspace,action,id,JSON.stringify(result),Date.now(),...args);
}
export function bookingCondition(workspace,kind,data,id='') {
 const staff=kind==='bookings'?'technician_id':'staff_id';const room=kind==='appointments'&&data.room_id;
 const condition='NOT EXISTS(SELECT 1 FROM records WHERE workspace_id=? AND kind=? AND id<>? AND deleted_at IS NULL AND status<>\'cancelled\' AND json_extract(data,\'$.start\')<? AND json_extract(data,\'$.end\')>? AND (json_extract(data,\'$.'+staff+'\')=?'+(room?' OR json_extract(data,\'$.room_id\')=?':'')+'))';
 return {condition,args:[workspace,kind,id,data.end,data.start,data[staff],...(room?[data.room_id]:[])]};
}
export async function saveRecord(env,workspace,user,m,input,id=null) {
 const previous=id?await getRecord(env,workspace,id,m.key):null;
 if(previous&&(!Number.isInteger(input.version)||input.version!==previous.version))fail(409,'Data berubah. Muat ulang sebelum menyimpan.');
 const parsed=await validate(env,workspace,m,input,previous);id=id||uid();
 if(m.key==='letters')parsed.data.body=await encryptLetter(parsed.data.body,env.PEPPER);
 const now=Date.now(),statements=[];
 const refs=m.fields.filter(f=>f.type==='ref'&&parsed.data[f.key]).map(f=>[parsed.data[f.key],f.ref]);
 if(refs.length)statements.push(validationReceipt(env,workspace,'reference-check',uid(),refs.map(()=>"EXISTS(SELECT 1 FROM records WHERE workspace_id=? AND id=? AND kind=? AND deleted_at IS NULL)").join(' AND '),refs.flatMap(([id,kind])=>[workspace,id,kind])));
 if(['bookings','appointments'].includes(m.key)&&parsed.status!=='cancelled') {
  const check=bookingCondition(workspace,m.key,parsed.data,id);
  statements.push(validationReceipt(env,workspace,'schedule-save',id+':'+(previous?.version||0),check.condition,check.args));
 }
 if(previous) {
  statements.push(validationReceipt(env,workspace,'record-edit',id+':'+previous.version,'EXISTS(SELECT 1 FROM records WHERE id=? AND workspace_id=? AND version=? AND deleted_at IS NULL)',[id,workspace,previous.version]));
  statements.push(env.DB.prepare('UPDATE records SET title=?,status=?,data=?,version=version+1,updated_at=? WHERE id=? AND workspace_id=? AND version=?').bind(parsed.title,parsed.status,JSON.stringify(parsed.data),now,id,workspace,previous.version));
 } else statements.push(env.DB.prepare('INSERT INTO records(id,workspace_id,kind,title,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,workspace,m.key,parsed.title,parsed.status,JSON.stringify(parsed.data),now,now));
 statements.push(auditStatement(env,workspace,user,previous?'record.update':'record.create',id,m.key));
 try {await env.DB.batch(statements);}catch(error) {if(/constraint|unique/i.test(error.message))fail(409,'Data duplikat, jadwal bentrok, atau data telah berubah. Muat ulang dan periksa kembali.');throw error;}
 if(m.key==='water_samples')await evaluateThresholds(env,workspace,user,id,parsed.data);
 return present(env,await getRecord(env,workspace,id));
}
export async function evaluateThresholds(env,workspace,user,id,data) {
 const thresholds=await env.DB.prepare("SELECT data FROM records WHERE workspace_id=? AND kind='thresholds' AND deleted_at IS NULL AND status='active' AND json_extract(data,'$.site_id')=?").bind(workspace,data.site_id).all();
 for(const row of thresholds.results) {const t=JSON.parse(row.data),value=data[t.metric];if(typeof value!=='number'||value>=t.minimum&&value<=t.maximum)continue;
  const alert={name:'Ambang '+t.metric+' terlampaui',site_id:data.site_id,sample_id:id,description:`${t.metric}: ${value}; ambang yang Anda tentukan ${t.minimum}–${t.maximum}`};
  const now=Date.now(),alertId=uid();await env.DB.batch([env.DB.prepare('INSERT INTO records(id,workspace_id,kind,title,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(alertId,workspace,'alerts',alert.name,'open',JSON.stringify(alert),now,now),auditStatement(env,workspace,user,'threshold.alert',alertId,t.metric)]);
 }
}
export async function deleteRecord(env,workspace,user,product,id) {
 const row=await getRecord(env,workspace,id);
 if(row.kind==='orders'&&!['draft','cancelled'].includes(row.status))fail(409,'Batalkan pesanan melalui workflow sebelum menghapusnya.');
 for(const module of product.modules) {
  for(const field of module.fields||[]) {
   if(field.ref===row.kind) {const ref=await env.DB.prepare('SELECT id FROM records WHERE workspace_id=? AND kind=? AND deleted_at IS NULL AND json_extract(data,?)=? LIMIT 1').bind(workspace,module.key,'$.'+field.key,id).first();if(ref)fail(409,'Data masih digunakan oleh '+module.label+'.');}
   if(field.type==='items'&&row.kind==='products') {const ref=await env.DB.prepare("SELECT r.id FROM records r,json_each(r.data,'$.items') item WHERE r.workspace_id=? AND r.kind=? AND r.deleted_at IS NULL AND json_extract(item.value,'$.product_id')=? LIMIT 1").bind(workspace,module.key,id).first();if(ref)fail(409,'Produk masih digunakan dalam '+module.label+'.');}
  }
 }
 await env.DB.batch([env.DB.prepare('UPDATE records SET deleted_at=?,version=version+1 WHERE id=? AND workspace_id=?').bind(Date.now(),id,workspace),auditStatement(env,workspace,user,'record.delete',id,row.kind)]);
 return {deleted:true};
}
