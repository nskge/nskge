// Node 22.13+; runs the Worker against SQLite using the real schema and SQL.
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const source=await readFile(new URL('./worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source))).default;
const db=new DatabaseSync(':memory:');
db.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
const DB={prepare(sql){let args=[];return {
  bind(...values){args=values;return this;},
  async first(){return db.prepare(sql).get(...args)??null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}
};}};
const allow={limit:async()=>({success:true})};
const env={DB,IP_HASH_SECRET:'a'.repeat(64),ADMIN_SECRET:'b'.repeat(64),TURNSTILE_SECRET_KEY:'c',TURNSTILE_SITE_KEY:'sitekey',ALLOWED_ORIGIN:'https://nskge.github.io',EXPECTED_HOSTNAME:'nskge.github.io',PUBLIC_RATE_LIMIT:allow,ADMIN_RATE_LIMIT:allow};
const id='d7f4f658-7811-4cbc-b4c9-a6b3e842be55',otherId='7c65bb2e-5dae-435f-a6dd-744a883fe52d';
const admin={Authorization:'Bearer '+env.ADMIN_SECRET};
const oldFetch=globalThis.fetch;
globalThis.fetch=async(_url,options)=>{const token=options.body.get('response');return {ok:true,json:async()=>({success:token!=='bad',hostname:token==='wrong-host'?'attacker.example':'nskge.github.io',action:token==='wrong-action'?'other':'message'})};};
async function call(path,{method='GET',origin=env.ALLOWED_ORIGIN,headers={},body,ip='203.0.113.1',raw=false}={}){
  const h=new Headers({'CF-Connecting-IP':ip,...headers});if(origin!==null)h.set('Origin',origin);
  if(body!==undefined&&!h.has('Content-Type'))h.set('Content-Type','application/json');
  const req=new Request('https://worker.example'+path,{method,headers:h,body:body===undefined?undefined:raw?body:JSON.stringify(body)});
  Object.defineProperty(req,'cf',{value:{country:'BR'}});
  const response=await worker.fetch(req,env);
  return {status:response.status,data:method==='OPTIONS'?null:await response.json(),headers:response.headers};
}
const mark=(data,extra={})=>call('/api/mark',{method:'POST',body:{visitorId:id,message:'oi',drawing:[],website:'',turnstile:'good',...data},...extra});
const visit=(visitorId=id,extra={})=>call('/api/visit',{method:'POST',body:{visitorId},...extra});
async function check(label,promise,status){const r=await promise;assert.equal(r.status,status,label+': '+JSON.stringify(r.data));console.log('OK',label);return r;}
try{
  await check('config',call('/api/config'),200);
  await check('foreign Origin',call('/api/config',{origin:'https://attacker.example'}),403);
  await check('missing Origin',call('/api/config',{origin:null}),403);
  await check('CORS preflight',call('/api/mark',{method:'OPTIONS'}),204);
  await check('foreign preflight',call('/api/mark',{method:'OPTIONS',origin:'https://attacker.example'}),403);
  await check('admin without bearer',call('/api/admin/messages'),401);
  await check('admin wrong bearer',call('/api/admin/messages',{headers:{Authorization:'Bearer '+'x'.repeat(64)}}),401);
  await check('admin foreign Origin',call('/api/admin/messages',{origin:'https://attacker.example',headers:admin}),403);
  await check('notifications without bearer',call('/api/admin/notifications'),401);
  env.PUBLIC_RATE_LIMIT={limit:async()=>({success:false})};
  await check('public edge request limit',call('/api/summary'),429);
  env.PUBLIC_RATE_LIMIT=allow;
  env.ADMIN_RATE_LIMIT={limit:async()=>({success:false})};
  await check('admin edge request limit',call('/api/admin/messages',{headers:admin}),429);
  env.ADMIN_RATE_LIMIT=allow;
  await check('invalid UUID',visit('<script>'),400);
  await check('non JSON',call('/api/visit',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}',raw:true}),415);
  await check('malformed JSON',call('/api/visit',{method:'POST',body:'{',raw:true}),400);
  await check('array JSON',call('/api/visit',{method:'POST',body:'[]',raw:true}),400);
  await check('large body without Content-Length',call('/api/visit',{method:'POST',body:' '.repeat(16385),raw:true}),413);
  await check('message object',mark({message:{a:1}}),400);
  await check('141 characters',mark({message:'a'.repeat(141)}),400);
  await check('bidi control',mark({message:'hi\u202e'}),400);
  await check('NUL control',mark({message:'hi\u0000'}),400);
  await check('empty mark',mark({message:'',drawing:[]}),400);
  await check('honeypot',mark({website:'spam'}),400);
  await check('SVG drawing',mark({drawing:'<svg onload=alert(1)>'}),400);
  await check('object point',mark({drawing:[[{x:1,y:1}]]}),400);
  await check('out of range point',mark({drawing:[[[2,0]]]}),400);
  await check('too many strokes',mark({drawing:Array.from({length:25},()=>[[.5,.5]])}),400);
  await check('bad Turnstile',mark({turnstile:'bad'}),403);
  await check('wrong Turnstile hostname',mark({turnstile:'wrong-host'}),403);
  await check('wrong Turnstile action',mark({turnstile:'wrong-action'}),403);
  let r=await check('first opening',visit(),200);assert.deepEqual(r.data,{visits:1,visitors:1,makers:0});
  r=await check('repeat opening',visit(),200);assert.deepEqual(r.data,{visits:2,visitors:1,makers:0});
  r=await check('second visitor',visit(otherId),200);assert.deepEqual(r.data,{visits:3,visitors:2,makers:0});
  for(let i=0;i<25;i++)await visit();
  r=await call('/api/summary');assert.equal(r.data.visits,21);assert.equal(r.data.visitors,2);
  console.log('OK opening count, approximate uniques, refresh limit');
  const injected="<img src=x onerror=alert('x')>' OR 1=1 --",drawing=[[[0,0],[.5,.5],[1,1]]];
  await check('message and drawing saved',mark({message:injected,drawing}),201);
  assert.equal(db.prepare('SELECT message FROM marks').get().message,injected);
  assert.equal(db.prepare('SELECT drawing FROM marks').get().drawing,JSON.stringify(drawing));
  await check('same minute rate limit',mark({message:'again'}),429);
  r=await check('admin reads saved mark',call('/api/admin/messages',{headers:admin}),200);
  assert.equal(r.data.rows[0].message,injected);assert.deepEqual(r.data.rows[0].drawing,drawing);
  assert.equal('ip_hash' in r.data.rows[0],false);
  r=await check('private notification',call('/api/admin/notifications',{headers:admin}),200);assert.equal(r.data.latest,1);
  await check('malicious cursor',call('/api/admin/messages?before=1%20OR%201=1',{headers:admin}),400);
  r=await check('public summary',call('/api/summary'),200);assert.deepEqual(Object.keys(r.data).sort(),['makers','visitors','visits']);assert.equal(r.data.makers,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM marks').get().n,1);
  const minute=Math.floor(Date.now()/60000);
  const ipHash=db.prepare('SELECT ip_hash FROM marks LIMIT 1').get().ip_hash;
  const insert=db.prepare('INSERT INTO marks(visitor_id,time_utc,minute_epoch,ip_hash,country,os,browser,message,drawing) VALUES(?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<2;i++)insert.run(id,new Date().toISOString(),minute-2,'other-ip-'+i,'BR','outro','outro','test','[]');
  await check('three marks per browser per day',mark({message:'fourth'},{ip:'203.0.113.2'}),429);
  db.prepare('UPDATE marks SET minute_epoch=? WHERE ip_hash=?').run(minute-2,ipHash);
  for(let i=0;i<299;i++)insert.run(otherId,new Date().toISOString(),minute-2,ipHash,'BR','outro','outro','test','[]');
  await check('three hundred marks per IP per day',mark({visitorId:otherId,message:'over daily limit'}),429);
  const frontend=await readFile(new URL('../assets/logs.js',import.meta.url),'utf8');
  assert(frontend.includes('el.textContent=String(s)')&&!frontend.includes('innerHTML'));
  assert(frontend.includes("document.createElement('canvas')"));
  console.log('OK SQL binding, XSS rendering, public data isolation');
  console.log('All integration and security checks passed');
}finally{globalThis.fetch=oldFetch;db.close();}
