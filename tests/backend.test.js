import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../platform/worker.js';import {testEnv} from './adapter.js';
const origin='https://isolated-test.invalid';
async function call(env,path,method='GET',data,auth={},product='daganghub',extra={}) {
 const headers={'X-Zwart-Product':product,'X-App-Origin':origin,'Origin':origin,'CF-Connecting-IP':'isolated-tests','Content-Type':'application/json',...extra};
 if(auth.cookie)headers.Cookie=auth.cookie;if(auth.csrf)headers['X-CSRF-Token']=auth.csrf;
 const response=await worker.fetch(new Request(origin+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
 return {status:response.status,data:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
}
async function account(env,email='owner@isolated-test.invalid',product='daganghub') {const r=await call(env,'/api/auth/register','POST',{name:'Isolated test account',email,password:'test-password-123456'}, {},product);assert.equal(r.status,201);return {...r.data,cookie:r.cookie};}
async function workspace(env,auth,product='daganghub') {const r=await call(env,'/api/workspaces','POST',{name:'Isolated workspace'},auth,product);assert.equal(r.status,201);return r.data.workspace.id;}
async function create(env,auth,ws,kind,data,product='daganghub') {const r=await call(env,`/api/workspaces/${ws}/records/${kind}`,'POST',data,auth,product);assert.equal(r.status,201,JSON.stringify(r.data));return r.data.record;}
test('server authentication rejects bad credentials and revokes sessions on password change',async()=>{
 const env=testEnv(),auth=await account(env);
 assert.match(auth.cookie,/__Host-zwart04_session=/);
 const stored=env.DB.sqlite.prepare('SELECT password_hash FROM users').get();assert.ok(!stored.password_hash.includes('test-password'));
 assert.equal((await call(env,'/api/auth/login','POST',{email:auth.user.email,password:'wrong-password'})).status,401);
 assert.equal((await call(env,'/api/auth/profile','PATCH',{name:'A'},auth,'daganghub',{Origin:'https://attacker.invalid'})).status,403);
 assert.equal((await call(env,'/api/auth/profile','PATCH',{name:'A'},{cookie:auth.cookie})).status,403);
 const changed=await call(env,'/api/auth/password','POST',{current:'test-password-123456',password:'new-password-123456'},auth);assert.equal(changed.status,200);
 assert.equal((await call(env,'/api/auth/session','GET',undefined,auth)).data.user,null);
 assert.equal((await call(env,'/api/auth/login','POST',{email:auth.user.email,password:'new-password-123456'})).status,200);
});
test('recovery codes rotate, and the old code cannot recover an account twice',async()=>{
 const env=testEnv(),auth=await account(env);
 const recovered=await call(env,'/api/auth/recover','POST',{email:auth.user.email,code:auth.recoveryCode,password:'recovered-password-123'});assert.equal(recovered.status,200);assert.notEqual(recovered.data.recoveryCode,auth.recoveryCode);
 assert.equal((await call(env,'/api/auth/recover','POST',{email:auth.user.email,code:auth.recoveryCode,password:'another-password-123'})).status,401);
 assert.equal((await call(env,'/api/auth/session','GET',undefined,auth)).data.user,null);
});
test('workspace and product isolation plus viewer permissions are enforced by the backend',async()=>{
 const env=testEnv(),owner=await account(env),ws=await workspace(env,owner),outsider=await account(env,'outside@isolated-test.invalid');
 assert.equal((await call(env,`/api/workspaces/${ws}/summary`,'GET',undefined,outsider)).status,404);
 assert.equal((await call(env,`/api/workspaces/${ws}/summary`,'GET',undefined,owner,'daily-apps')).status,404);
 const invitation=await call(env,`/api/workspaces/${ws}/invitations`,'POST',{email:outsider.user.email,role:'viewer'},owner);assert.equal(invitation.status,200);
 const token=new URL(invitation.data.url).searchParams.get('invite');
 assert.equal((await call(env,'/api/invitations/accept','POST',{token},outsider)).status,200);
 assert.equal((await call(env,`/api/workspaces/${ws}/summary`,'GET',undefined,outsider)).status,200);
 assert.equal((await call(env,`/api/workspaces/${ws}/records/customers`,'POST',{name:'Blocked'},outsider)).status,403);
});
test('order confirmation, stock and payment workflows are atomic and idempotent',async()=>{
 const env=testEnv(),auth=await account(env),ws=await workspace(env,auth);
 const product=await create(env,auth,ws,'products',{name:'Test product',sku:'isolated-1',price:25000,stock:5,cost:10000}),customer=await create(env,auth,ws,'customers',{name:'Test customer'});
 const order=await create(env,auth,ws,'orders',{name:'Test order',customer_id:customer.id,items:[{product_id:product.id,quantity:3}],date:'2026-10-03'});
 const action=name=>call(env,`/api/workspaces/${ws}/actions/${name}`,'POST',{id:order.id},auth);
 assert.equal((await action('confirm-order')).status,200);assert.equal((await action('confirm-order')).data.idempotent,true);
 const stock=await call(env,`/api/workspaces/${ws}/records/products/${product.id}`,'GET',undefined,auth);assert.equal(stock.data.record.data.stock,2);
 const second=await create(env,auth,ws,'orders',{name:'Too many',customer_id:customer.id,items:[{product_id:product.id,quantity:3}],date:'2026-10-03'});
 assert.equal((await call(env,`/api/workspaces/${ws}/actions/confirm-order`,'POST',{id:second.id},auth)).status,409);
 assert.equal((await action('pay-order')).status,409);assert.equal((await action('invoice-order')).status,200);assert.equal((await action('pay-order')).status,200);
 const invoices=await call(env,`/api/workspaces/${ws}/records/invoices`,'GET',undefined,auth);assert.equal(invoices.data.records[0].data.amount,75000);assert.equal(invoices.data.records[0].status,'paid');
 assert.equal((await action('cancel-order')).status,409);
});
test('cancelled orders restore inventory once and stale edits do not overwrite newer records',async()=>{
 const env=testEnv(),auth=await account(env),ws=await workspace(env,auth),p=await create(env,auth,ws,'products',{name:'Test product',sku:'isolated-2',price:1000,stock:5}),c=await create(env,auth,ws,'customers',{name:'Test customer'});
 const o=await create(env,auth,ws,'orders',{name:'Test order',customer_id:c.id,items:[{product_id:p.id,quantity:2}],date:'2026-10-03'});
 for(const action of ['confirm-order','cancel-order','cancel-order'])assert.equal((await call(env,`/api/workspaces/${ws}/actions/${action}`,'POST',{id:o.id},auth)).status,200);
 const current=(await call(env,`/api/workspaces/${ws}/records/products/${p.id}`,'GET',undefined,auth)).data.record;assert.equal(current.data.stock,5);
 assert.equal((await call(env,`/api/workspaces/${ws}/records/products/${p.id}`,'PUT',{...current.data,name:'Updated',version:current.version},auth)).status,200);
 assert.equal((await call(env,`/api/workspaces/${ws}/records/products/${p.id}`,'PUT',{...current.data,name:'Stale',version:current.version},auth)).status,409);
});
test('conflicting staff bookings are rejected by an atomic database check',async()=>{
 const env=testEnv(),auth=await account(env,'scheduler@isolated-test.invalid','servora'),ws=await workspace(env,auth,'servora');
 const c=await create(env,auth,ws,'customers',{name:'Client'},'servora'),t=await create(env,auth,ws,'technicians',{name:'Technician'},'servora'),s=await create(env,auth,ws,'services',{name:'Service'},'servora');
 const data={name:'Booking',customer_id:c.id,technician_id:t.id,service_id:s.id,start:'2026-10-03T09:00:00Z',end:'2026-10-03T10:00:00Z'};
 await create(env,auth,ws,'bookings',data,'servora');assert.equal((await call(env,`/api/workspaces/${ws}/records/bookings`,'POST',{...data,start:'2026-10-03T09:30:00Z',end:'2026-10-03T10:30:00Z'},auth,'servora')).status,409);
 assert.equal((await call(env,`/api/workspaces/${ws}/records/bookings`,'POST',{...data,start:'2026-10-03T10:00:00Z',end:'2026-10-03T11:00:00Z'},auth,'servora')).status,201);
});
test('sealed letters are encrypted and cannot be read early or opened by editing their time',async()=>{
 const env=testEnv(),auth=await account(env,'writer@isolated-test.invalid','daily-apps'),ws=await workspace(env,auth,'daily-apps');
 const row=await create(env,auth,ws,'letters',{name:'Sealed test',body:'private test text',unlock_at:new Date(Date.now()+3600000).toISOString()},'daily-apps');assert.equal(row.data.body,'');assert.equal(row.data.locked,true);
 const stored=env.DB.sqlite.prepare('SELECT data FROM records WHERE id=?').get(row.id).data;assert.ok(!stored.includes('private test text'));
 assert.equal((await call(env,`/api/workspaces/${ws}/records/letters/${row.id}`,'PUT',{name:'Bypass',body:'x',unlock_at:new Date().toISOString(),version:row.version},auth,'daily-apps')).status,409);
});
test('quiz scores are calculated from stored answer keys instead of client-submitted scores',async()=>{
 const env=testEnv(),auth=await account(env,'teacher@isolated-test.invalid','tutormind'),ws=await workspace(env,auth,'tutormind');
 const c=await create(env,auth,ws,'courses',{name:'Isolated course'},'tutormind');const q=await create(env,auth,ws,'quizzes',{name:'Isolated quiz',course_id:c.id,questions:[{question:'2 + 2',options:['3','4'],correct:1},{question:'3 + 3',options:['5','6'],correct:1}]},'tutormind');
 const attempt=await call(env,`/api/workspaces/${ws}/actions/submit-quiz`,'POST',{id:q.id,answers:[1,0],score:100},auth,'tutormind');assert.equal(attempt.status,200);assert.equal(attempt.data.score,50);
 assert.equal((await call(env,`/api/workspaces/${ws}/records/attempts`,'POST',{name:'Forged',quiz_id:q.id,answers:[1,1],score:100,date:'2026-10-03'},auth,'tutormind')).status,422);
});
test('provider failures remain failures, and no synthetic AI success is returned',async()=>{
 const env=testEnv(),auth=await account(env,'ai@isolated-test.invalid','daily-apps'),ws=await workspace(env,auth,'daily-apps');env.AI={run:async()=>{throw new Error('Provider unavailable');}};
 const response=await call(env,`/api/workspaces/${ws}/ai`,'POST',{prompt:'Isolated provider failure test'},auth,'daily-apps');assert.equal(response.status,503);assert.equal(response.data.answer,undefined);
 assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM ai_messages').get().n,0);
});
test('published forms persist anonymous responses, rotate links, and close immediately',async()=>{
 const env=testEnv(),auth=await account(env,'forms@isolated-test.invalid','daily-apps'),ws=await workspace(env,auth,'daily-apps');
 const form=await create(env,auth,ws,'forms',{name:'Isolated form',description:'Validation only',fields:[{label:'Email','type':'email',required:true}],status:'published'},'daily-apps');
 const published=await call(env,`/api/workspaces/${ws}/actions/publish-form`,'POST',{id:form.id},auth,'daily-apps');assert.equal(published.status,200);
 const token=new URL(published.data.url).searchParams.get('form');
 assert.equal((await call(env,'/api/public-forms/'+token)).status,404);
 assert.equal((await call(env,'/api/public-forms/'+token,'GET',undefined,{},'daily-apps')).status,200);
 assert.equal((await call(env,'/api/public-forms/'+token,'POST',{answers:{field0:'bad-email'}},{},'daily-apps')).status,422);
 assert.equal((await call(env,'/api/public-forms/'+token,'POST',{answers:{field0:'valid@isolated-test.invalid'}},{},'daily-apps')).status,200);
 assert.equal((await call(env,`/api/workspaces/${ws}/records/form_responses`,'GET',undefined,auth,'daily-apps')).data.total,1);
 const rotated=await call(env,`/api/workspaces/${ws}/actions/publish-form`,'POST',{id:form.id},auth,'daily-apps');assert.notEqual(rotated.data.url,published.data.url);
 assert.equal((await call(env,'/api/public-forms/'+token,'GET',undefined,{},'daily-apps')).status,404);
 await call(env,`/api/workspaces/${ws}/records/forms/${form.id}`,'PUT',{...form.data,status:'closed',version:form.version},auth,'daily-apps');
 const second=new URL(rotated.data.url).searchParams.get('form');assert.equal((await call(env,'/api/public-forms/'+second,'GET',undefined,{},'daily-apps')).status,404);
});
test('deleting and restoring real records works for products with tool modules',async()=>{
 const env=testEnv(),auth=await account(env,'delete@isolated-test.invalid','daily-apps'),ws=await workspace(env,auth,'daily-apps');
 const note=await create(env,auth,ws,'notes',{name:'Isolated note',body:'Actual test input',status:'active'},'daily-apps');
 assert.equal((await call(env,`/api/workspaces/${ws}/records/notes/${note.id}`,'DELETE',undefined,auth,'daily-apps')).status,200);
 assert.equal((await call(env,`/api/workspaces/${ws}/records/notes`,'GET',undefined,auth,'daily-apps')).data.total,0);
 assert.equal((await call(env,`/api/workspaces/${ws}/restore/${note.id}`,'POST',{},auth,'daily-apps')).status,200);
 assert.equal((await call(env,`/api/workspaces/${ws}/records/notes`,'GET',undefined,auth,'daily-apps')).data.total,1);
});
