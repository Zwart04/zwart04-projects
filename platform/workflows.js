import {uid} from './auth.js';
import {fail,getRecord,auditStatement,validationReceipt,present} from './data.js';
const update=(env,row,data,status)=>env.DB.prepare('UPDATE records SET data=?,status=?,version=version+1,updated_at=? WHERE id=? AND workspace_id=? AND version=?').bind(JSON.stringify(data),status,Date.now(),row.id,row.workspace_id,row.version);
const insert=(env,workspace,kind,id,title,status,data)=>env.DB.prepare('INSERT INTO records(id,workspace_id,kind,title,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,workspace,kind,title,status,JSON.stringify(data),Date.now(),Date.now());
const guardRow=row=>({condition:'EXISTS(SELECT 1 FROM records WHERE id=? AND workspace_id=? AND version=? AND deleted_at IS NULL)',args:[row.id,row.workspace_id,row.version]});
export async function runWorkflow(env,workspace,user,product,action,input) {
 if(action==='submit-quiz') {
  if(product.id!=='tutormind')fail(404,'Workflow tidak ditemukan.');
  const quiz=await getRecord(env,workspace,input.id,'quizzes');const answers=input.answers;
  if(!Array.isArray(answers)||answers.length!==quiz.data.questions.length||answers.some(n=>!Number.isInteger(n)))fail(422,'Jawab seluruh pertanyaan.');
  const correct=quiz.data.questions.reduce((count,q,i)=>count+(q.correct===answers[i]?1:0),0);
  const score=Math.round(correct/answers.length*100),id=uid(),data={name:'Latihan '+quiz.title,quiz_id:quiz.id,answers,score,date:new Date().toISOString().slice(0,10),user_id:user.id};
  await env.DB.batch([insert(env,workspace,'attempts',id,data.name,'submitted',data),auditStatement(env,workspace,user,'quiz.submit',id,String(score))]);
  return {record:await getRecord(env,workspace,id),score,correct,total:answers.length};
 }
 const row=await getRecord(env,workspace,input.id),key=row.id;
 const allowed=product.modules.find(m=>m.key===row.kind)?.actions||[];
 if(!allowed.includes(action))fail(404,'Aksi tidak tersedia untuk modul ini.');
 const existing=await env.DB.prepare('SELECT result FROM workflow_keys WHERE workspace_id=? AND action=? AND idempotency_key=?').bind(workspace,action,key).first();
 if(existing)return {...JSON.parse(existing.result),idempotent:true,record:await present(env,await getRecord(env,workspace,row.id))};
 const result={id:row.id,action},statements=[],check=guardRow(row);
 let condition=check.condition,args=check.args;
 if(action==='confirm-order') {
  if(row.status!=='draft')fail(409,'Pesanan harus berstatus draft.');
  const products=[];
  for(const item of row.data.items) {
   const p=await getRecord(env,workspace,item.product_id,'products');if(p.data.stock<item.quantity)fail(409,'Stok '+p.title+' tidak cukup.');products.push([p,item]);
   condition+=' AND EXISTS(SELECT 1 FROM records WHERE id=? AND workspace_id=? AND version=? AND deleted_at IS NULL AND json_extract(data,\'$.stock\')>=?)';args.push(p.id,workspace,p.version,item.quantity);
  }
  condition+=' AND EXISTS(SELECT 1 FROM records WHERE id=? AND status=\'draft\')';args.push(row.id);
  for(const [p,item] of products)statements.push(update(env,p,{...p.data,stock:p.data.stock-item.quantity},p.status));
  statements.push(update(env,row,row.data,'confirmed'));
 } else if(action==='cancel-order') {
  if(!['draft','confirmed'].includes(row.status))fail(409,'Hanya draft atau pesanan belum dibayar yang dapat dibatalkan.');
  if(row.status==='confirmed')for(const item of row.data.items) {const p=await getRecord(env,workspace,item.product_id,'products');condition+=' AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=? AND deleted_at IS NULL)';args.push(p.id,p.version);statements.push(update(env,p,{...p.data,stock:p.data.stock+item.quantity},p.status));}
  const invoices=await env.DB.prepare("SELECT * FROM records WHERE workspace_id=? AND kind='invoices' AND deleted_at IS NULL AND json_extract(data,'$.order_id')=?").bind(workspace,row.id).all();
  for(const invoice of invoices.results){invoice.data=JSON.parse(invoice.data);statements.push(update(env,invoice,invoice.data,'void'));}
  statements.push(update(env,row,row.data,'cancelled'));
 } else if(action==='invoice-order') {
  if(!['confirmed','paid','shipped','completed'].includes(row.status))fail(409,'Konfirmasi pesanan sebelum membuat invoice.');
  const id=uid(),data={name:'INV-'+row.id.slice(0,8).toUpperCase(),order_id:row.id,customer_id:row.data.customer_id,amount:row.data.total,due_date:input.due_date||new Date(Date.now()+7*86400000).toISOString().slice(0,10),notes:''};
  statements.push(insert(env,workspace,'invoices',id,data.name,row.status==='confirmed'?'unpaid':'paid',data));result.created_id=id;
 } else if(action==='pay-order') {
  if(row.status!=='confirmed')fail(409,'Pesanan belum siap dibayar.');
  const invoices=await env.DB.prepare("SELECT * FROM records WHERE workspace_id=? AND kind='invoices' AND deleted_at IS NULL AND json_extract(data,'$.order_id')=? AND status='unpaid'").bind(workspace,row.id).all();
  if(!invoices.results.length)fail(409,'Buat invoice terlebih dahulu.');
  statements.push(update(env,row,{...row.data,paid_at:new Date().toISOString()},'paid'));
  for(const invoice of invoices.results){invoice.data=JSON.parse(invoice.data);statements.push(update(env,invoice,{...invoice.data,paid_at:new Date().toISOString()},'paid'));}
 } else if(action==='ship-order') {
  if(row.status!=='paid')fail(409,'Catat pembayaran sebelum mengirim pesanan.');
  if(typeof input.carrier!=='string'||!input.carrier.trim()||typeof input.tracking!=='string'||!input.tracking.trim()||input.carrier.length>100||input.tracking.length>150)fail(422,'Kurir dan nomor resi wajib diisi.');
  const customer=await getRecord(env,workspace,row.data.customer_id,'customers'),id=uid(),data={name:'Pengiriman '+row.title,order_id:row.id,carrier:input.carrier.trim(),tracking:input.tracking.trim(),address:customer.data.address||''};
  statements.push(update(env,row,row.data,'shipped'),insert(env,workspace,'shipments',id,data.name,'shipped',data));result.created_id=id;
 } else if(action==='complete-order') {
  if(row.status!=='shipped')fail(409,'Pesanan harus sudah dikirim.');
  const rows=await env.DB.prepare("SELECT * FROM records WHERE workspace_id=? AND kind='shipments' AND deleted_at IS NULL AND json_extract(data,'$.order_id')=?").bind(workspace,row.id).all();
  statements.push(update(env,row,row.data,'completed'));for(const shipment of rows.results){shipment.data=JSON.parse(shipment.data);statements.push(update(env,shipment,shipment.data,'delivered'));}
 } else if(action==='post-stock') {
  if(row.status!=='pending')fail(409,'Mutasi sudah diproses.');
  const p=await getRecord(env,workspace,row.data.product_id,'products'),quantity=row.data.quantity;
  if(!Number.isInteger(quantity)||p.data.stock+quantity<0)fail(422,'Jumlah mutasi harus integer dan tidak boleh membuat stok negatif.');
  condition+=' AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=? AND deleted_at IS NULL AND json_extract(data,\'$.stock\')+?>=0)';args.push(p.id,p.version,quantity);
  statements.push(update(env,p,{...p.data,stock:p.data.stock+quantity},p.status),update(env,row,row.data,'posted'));
 } else if(action==='booking-job') {
  if(product.id!=='servora'||row.status!=='confirmed')fail(409,'Booking harus berstatus confirmed.');
  const id=uid(),data={name:'Pekerjaan '+row.title,booking_id:row.id,technician_id:row.data.technician_id,vehicle_id:'',lat:0,lng:0,notes:row.data.notes||''};
  statements.push(insert(env,workspace,'jobs',id,data.name,'todo',data),update(env,row,row.data,'in_progress'));result.created_id=id;
 } else if(action==='appointment-encounter') {
  if(product.id!=='clinic-os'||row.status!=='scheduled')fail(409,'Janji temu harus berstatus scheduled.');
  const id=uid(),data={name:'Kunjungan '+row.title,appointment_id:row.id,patient_id:row.data.patient_id,date:new Date().toISOString().slice(0,10),notes:''};
  statements.push(insert(env,workspace,'encounters',id,data.name,'open',data),update(env,row,row.data,'checked_in'));result.created_id=id;
 } else fail(404,'Workflow tidak ditemukan.');
 statements.unshift(validationReceipt(env,workspace,action,key,condition,args,result));
 statements.push(auditStatement(env,workspace,user,'workflow.'+action,row.id));
 try {await env.DB.batch(statements);}catch(error){if(/constraint|unique/i.test(error.message))fail(409,'Data berubah saat workflow diproses. Muat ulang dan coba kembali.');throw error;}
 return {...result,record:await present(env,await getRecord(env,workspace,row.id))};
}
