const encode = new TextEncoder();
export const uid = () => crypto.randomUUID();
export const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('');
export const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(value))), n => n.toString(16).padStart(2,'0')).join('');
export function equal(a,b) { if (typeof a!=='string'||typeof b!=='string'||a.length!==b.length) return false; let diff=0; for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i); return diff===0; }
export function validPassword(password) { return typeof password==='string' && password.length>=12 && password.length<=128; }
export function validEmail(value) { return typeof value==='string' && value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export async function passwordHash(password,pepper,salt=random()) {
 if (!pepper||pepper.length<32) throw new Error('Authentication secret is not configured');
 const material=await crypto.subtle.importKey('raw',encode.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encode.encode(salt),iterations:100000,hash:'SHA-256'},material,256);
 const key=await crypto.subtle.importKey('raw',encode.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,bits));
 return salt+':'+Array.from(signature,n=>n.toString(16).padStart(2,'0')).join('');
}
export async function verifyPassword(password,stored,pepper) { if(typeof password!=='string'||password.length>128) return false; const salt=stored.split(':')[0]; return equal(await passwordHash(password,pepper,salt),stored); }
export const recoveryHash = (code,pepper) => digest('recovery:'+pepper+':'+code);
export const cookie = value => '__Host-zwart04_session='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600';
export const clearCookie = '__Host-zwart04_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
export function tokenCookie(request) { return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-zwart04_session='))?.split('=')[1] || ''; }
export async function session(env,request) {
 const raw=tokenCookie(request); if(!/^[a-f0-9]{64}$/.test(raw)) return null;
 const token=await digest(raw);
 const result=await env.DB.prepare('SELECT u.id,u.email,u.name,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(token,Date.now()).first();
 return result || null;
}
export async function newSession(env,user) {
 const token=random(),csrf=random(),now=Date.now();
 await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await digest(token),user.id,csrf,now+14*86400000,now).run();
 return {headers:{'Set-Cookie':cookie(token)},csrf};
}
export async function limit(env,key,maximum,seconds) {
 const now=Date.now(),window=Math.floor(now/(seconds*1000));
 const bucket=await digest(key+':'+window);
 const row=await env.DB.prepare('INSERT INTO rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(bucket,now+seconds*1000,maximum).first();
 return !!row;
}
