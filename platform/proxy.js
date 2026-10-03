export default {
 async fetch(request,env) {
  const url=new URL(request.url);
  if(url.hostname!==env.CANONICAL_HOST && !url.hostname.endsWith('.workers.dev') && !['localhost','127.0.0.1'].includes(url.hostname)) return Response.redirect('https://'+env.CANONICAL_HOST+url.pathname+url.search,301);
  if(url.pathname.startsWith('/api/')) {
   const headers=new Headers(request.headers);headers.set('X-Zwart-Product',env.PRODUCT);headers.set('X-App-Origin',url.origin);
   return env.BACKEND.fetch(new Request('https://internal.zwart04'+url.pathname+url.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));
  }
  const response=await env.ASSETS.fetch(request);const headers=new Headers(response.headers);
  if(['/code-runner.js','/regex-worker.js'].includes(url.pathname)) {
   headers.set('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'");headers.set('X-Content-Type-Options','nosniff');
   return new Response(response.body,{status:response.status,headers});
  }
  headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data: https:; media-src 'self' blob: data:; connect-src 'self' https://api.coinbase.com https://api.exchange.coinbase.com https://api.frankfurter.dev https://api.frankfurter.app; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  return new Response(response.body,{status:response.status,headers});
 }
};
