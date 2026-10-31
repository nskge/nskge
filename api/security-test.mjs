// Run: node api/security-test.mjs (Node 20+)
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile(new URL('./worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source))).default;
const uuid='d7f4f658-7811-4cbc-b4c9-a6b3e842be55';
const env={DB:{},IP_HASH_SECRET:'a'.repeat(64),ADMIN_SECRET:'b'.repeat(64),TURNSTILE_SECRET_KEY:'c'.repeat(64),TURNSTILE_SITE_KEY:'0x4AAAAA',ALLOWED_ORIGIN:'https://nskge.github.io',EXPECTED_HOSTNAME:'nskge.github.io'};
async function req(path,data,origin='https://nskge.github.io',headers={}){
  const request=new Request('https://worker.example'+path,{method:data===null?'GET':'POST',headers:{Origin:origin,...(data===null?{}:{'Content-Type':'application/json'}),...headers},body:data===null?undefined:JSON.stringify(data)});
  const res=await worker.fetch(request,env);
  return {status:res.status,data:await res.json()};
}
async function rejects(label,data,code=400){
  const result=await req('/api/mark',data);
  assert.equal(result.status,code,label+': '+JSON.stringify(result));
  console.log('OK',label);
}
assert.equal((await req('/api/config',null,'https://attacker.example')).status,403);
assert.equal((await req('/api/admin/messages',null)).status,401);
const base={visitorId:uuid,message:'oi',drawing:[],website:''};
await rejects('bad UUID',{...base,visitorId:'<svg/onload=alert(1)>'});
await rejects('141 characters',{...base,message:'a'.repeat(141)});
await rejects('bidi spoof',{...base,message:'oi\u202E'});
await rejects('empty payload',{...base,message:''});
await rejects('script object in drawing',{...base,drawing:[[{x:'<script>'}]]});
await rejects('invalid coordinates',{...base,drawing:[[[2,0]]]});
await rejects('non-finite coordinate',{...base,drawing:[[[Infinity,0]]]});
await rejects('25 strokes',{...base,drawing:Array.from({length:25},()=>[[.5,.5]])});
await rejects('honeypot',{...base,website:'spam'});
await rejects('SVG as drawing',{...base,drawing:'<svg onload=alert(1)>'});
const captured=[];
env.DB={prepare(sql){return {bind(...args){captured.push({sql,args});return this;},async first(){return {recent:0,daily:0,visitor:0};},async run(){return {meta:{changes:1}};}};}};
const fetchBefore=globalThis.fetch;
globalThis.fetch=async()=>({ok:true,json:async()=>({success:true,hostname:'nskge.github.io',action:'message'})});
try{
  const injected="<img src=x onerror=alert('x')>' OR 1=1 --";
  const result=await req('/api/mark',{...base,message:injected,turnstile:'valid-test-token'});
  assert.equal(result.status,201,JSON.stringify(result));
  const stmt=captured.find(x=>x.sql.startsWith('INSERT INTO marks'));
  assert(stmt,'insert statement');
  assert(!stmt.sql.includes(injected),'SQL text must never contain message payload');
  assert(stmt.args.includes(injected),'message must be passed only in bound parameters');
  console.log('OK XSS text stored as data; SQL injection payload bound');
}finally{globalThis.fetch=fetchBefore;}
console.log('All security checks passed');
