// Cloudflare Worker for anonymous NFC guestbook. Secrets are stored in Worker secrets, never in GitHub.
const enc=new TextEncoder();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const minute=()=>Math.floor(Date.now()/60000);
function headers(origin,env){
  const h=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  if(origin===env.ALLOWED_ORIGIN){h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin');h.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');h.set('Access-Control-Allow-Headers','Content-Type, Authorization');h.set('Access-Control-Max-Age','600');}
  return h;
}
function out(obj,status,origin,env){return new Response(JSON.stringify(obj),{status,headers:headers(origin,env)});}
const bad=(code,detail)=>{throw {code,detail};};
function checkedId(id){if(typeof id!=='string'||!uuid.test(id))bad(400,'Identificador inválido.');return id.toLowerCase();}
function checkedMessage(raw){
  if(typeof raw!=='string')bad(400,'Mensagem inválida.');
  const text=raw.trim().normalize('NFC');
  if(Array.from(text).length>140||enc.encode(text).length>560)bad(400,'Máximo de 140 caracteres.');
  if(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(text))bad(400,'Caracteres inválidos.');
  return text;
}
function checkedDrawing(value){
  if(!Array.isArray(value)||value.length>24)bad(400,'Desenho inválido.');
  let count=0;const result=[];
  for(const line of value){
    if(!Array.isArray(line)||line.length<1||line.length>80)bad(400,'Traço inválido.');
    count+=line.length;if(count>350)bad(400,'Desenho muito grande.');
    const stroke=[];
    for(const p of line){
      if(!Array.isArray(p)||p.length!==2||!p.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1))bad(400,'Coordenadas inválidas.');
      stroke.push(p.map(n=>Math.round(n*1000)/1000));
    }
    result.push(stroke);
  }
  if(JSON.stringify(result).length>9000)bad(413,'Desenho muito grande.');
  return result;
}
async function bodyJSON(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))bad(415,'Formato inválido.');
  if(Number(request.headers.get('Content-Length'))>16384)bad(413,'Envio muito grande.');
  const reader=request.body?.getReader();if(!reader)bad(400,'Corpo ausente.');
  const chunks=[];let size=0;
  try{
    while(true){
      const part=await reader.read();if(part.done)break;
      size+=part.value.byteLength;if(size>16384){await reader.cancel();bad(413,'Envio muito grande.');}
      chunks.push(part.value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  try{const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();
    return parsed;
  }catch{bad(400,'JSON inválido.');}
}
function info(request){
  const ua=(request.headers.get('User-Agent')||'').slice(0,600);
  const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Mac OS X/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'outro';
  const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'outro';
  const c=request.cf?.country;return {os,browser,country:typeof c==='string'&&/^[A-Z]{2}$/.test(c)?c:'??'};
}
async function hashedIP(request,env){
  // HMAC for rate limits, with independently generated secret; raw IP is never written to D1.
  const key=await crypto.subtle.importKey('raw',enc.encode(env.IP_HASH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const value=await crypto.subtle.sign('HMAC',key,enc.encode(request.headers.get('CF-Connecting-IP')||'unknown'));
  return [...new Uint8Array(value)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function adminOK(request,env){
  const a=request.headers.get('Authorization')||'';
  if(!a.startsWith('Bearer ')||a.length<40||a.length>200)return false;
  const hashes=await Promise.all([a.slice(7),env.ADMIN_SECRET].map(s=>crypto.subtle.digest('SHA-256',enc.encode(s))));
  const left=new Uint8Array(hashes[0]),right=new Uint8Array(hashes[1]);
  let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
  return diff===0;
}
async function checkTurnstile(token,env){
  if(typeof token!=='string'||!token||token.length>2048)return false;
  const form=new FormData();form.set('secret',env.TURNSTILE_SECRET_KEY);form.set('response',token);
  try{
    const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form,signal:AbortSignal.timeout(6000)});
    if(!r.ok)return false;
    const v=await r.json();
    return v.success===true&&v.hostname===env.EXPECTED_HOSTNAME&&v.action==='message';
  }catch{return false;}
}
async function main(request,env){
  const origin=request.headers.get('Origin');const url=new URL(request.url);
  const allowed=origin===env.ALLOWED_ORIGIN;
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:headers(origin,env)});
  if(!allowed)return out({error:'Origem não permitida.'},403,origin,env);
  if(!env.DB||!env.IP_HASH_SECRET||!env.ADMIN_SECRET||!env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY||env.TURNSTILE_SITE_KEY.startsWith('REPLACE'))return out({error:'API não configurada.'},503,origin,env);
  const path=url.pathname;
  if(request.method==='GET'&&path==='/api/config')return out({enabled:true,siteKey:env.TURNSTILE_SITE_KEY},200,origin,env);
  if(request.method==='GET'&&path==='/api/summary'){
    const c=await env.DB.prepare('SELECT COUNT(*) AS visits,COUNT(DISTINCT visitor_id) AS visitors FROM visits').first();
    return out(c,200,origin,env);
  }
  if(request.method==='POST'&&path==='/api/visit'){
    const value=await bodyJSON(request),id=checkedId(value.visitorId),m=minute(),hash=await hashedIP(request,env),d=info(request);
    // Count each opening, with atomic per-browser and per-IP ceilings against refresh spam.
    await env.DB.prepare('INSERT INTO visits(visitor_id,time_utc,minute_epoch,ip_hash,country,os,browser) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM visits WHERE visitor_id=? AND minute_epoch>?)<20 AND (SELECT COUNT(*) FROM visits WHERE ip_hash=? AND minute_epoch>?)<100')
      .bind(id,new Date().toISOString(),m,hash,d.country,d.os,d.browser,id,m-60,hash,m-60).run();
    const c=await env.DB.prepare('SELECT COUNT(*) AS visits,COUNT(DISTINCT visitor_id) AS visitors FROM visits').first();
    return out(c,200,origin,env);
  }
  if(request.method==='POST'&&path==='/api/mark'){
    const value=await bodyJSON(request),id=checkedId(value.visitorId),msg=checkedMessage(value.message),drawing=checkedDrawing(value.drawing);
    if(!msg&&!drawing.length)return out({error:'Escreva ou desenhe alguma coisa.'},400,origin,env);
    if(value.website!=='')return out({error:'Não foi possível enviar.'},400,origin,env);
    const m=minute(),hash=await hashedIP(request,env);
    const limit=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM marks WHERE ip_hash=? AND minute_epoch>?) AS recent,(SELECT COUNT(*) FROM marks WHERE ip_hash=? AND minute_epoch>?) AS daily,(SELECT COUNT(*) FROM marks WHERE visitor_id=? AND minute_epoch>?) AS visitor')
      .bind(hash,m-1,hash,m-1440,id,m-1440).first();
    if(limit.recent>=1||limit.daily>=12||limit.visitor>=3)return out({error:'Limite atingido. Tente mais tarde.'},429,origin,env);
    if(!await checkTurnstile(value.turnstile,env))return out({error:'Verificação antispam inválida.'},403,origin,env);
    const d=info(request);
    const r=await env.DB.prepare('INSERT INTO marks(visitor_id,time_utc,minute_epoch,ip_hash,country,os,browser,message,drawing) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM marks WHERE ip_hash=? AND minute_epoch>?)=0 AND (SELECT COUNT(*) FROM marks WHERE ip_hash=? AND minute_epoch>?)<12 AND (SELECT COUNT(*) FROM marks WHERE visitor_id=? AND minute_epoch>?)<3')
      .bind(id,new Date().toISOString(),m,hash,d.country,d.os,d.browser,msg,JSON.stringify(drawing),hash,m-1,hash,m-1440,id,m-1440).run();
    if((r.meta?.changes||0)!==1)return out({error:'Limite atingido. Tente mais tarde.'},429,origin,env);
    return out({ok:true},201,origin,env);
  }
  if(request.method==='GET'&&path==='/api/admin/notifications'){
    if(!await adminOK(request,env))return out({error:'Acesso negado.'},401,origin,env);
    const latest=await env.DB.prepare('SELECT COALESCE(MAX(id),0) AS latest FROM marks').first();
    return out({latest:latest.latest},200,origin,env);
  }
  if(request.method==='GET'&&(path==='/api/admin/visits'||path==='/api/admin/messages')){
    if(!await adminOK(request,env))return out({error:'Acesso negado.'},401,origin,env);
    const raw=url.searchParams.get('before');
    if(raw&&!/^[1-9][0-9]{0,9}$/.test(raw))return out({error:'Cursor inválido.'},400,origin,env);
    const before=raw?Number(raw):2147483647,marks=path.endsWith('/messages');
    const table=marks?'marks':'visits';
    const columns=marks?'id,visitor_id,time_utc,country,os,browser,message,drawing':'id,visitor_id,time_utc,country,os,browser';
    const result=await env.DB.prepare('SELECT '+columns+' FROM '+table+' WHERE id<? ORDER BY id DESC LIMIT 50').bind(before).all();
    const total=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM visits) AS visits,(SELECT COUNT(DISTINCT visitor_id) FROM visits) AS visitors,(SELECT COUNT(*) FROM marks) AS messages').first();
    const rows=result.results.map(x=>({...x,visitor_id:x.visitor_id.slice(0,8),...(marks?{drawing:JSON.parse(x.drawing)}:{})}));
    return out({total,rows,next:rows.length===50?rows[49].id:null},200,origin,env);
  }
  return out({error:'Rota indisponível.'},404,origin,env);
}
export default {
  async fetch(request,env){
    try{return await main(request,env);}
    catch(e){if(Number.isInteger(e?.code)&&e.code>=400&&e.code<=499)return out({error:e.detail},e.code,request.headers.get('Origin'),env);
      console.error('API failure',e?.name||'Error');
      return out({error:'Erro temporário.'},500,request.headers.get('Origin'),env);}
  },
  async scheduled(event,env,ctx){
    const cutoff=minute()-90*1440;
    ctx.waitUntil(Promise.all([
      env.DB.prepare('DELETE FROM visits WHERE minute_epoch<?').bind(cutoff).run(),
      env.DB.prepare('DELETE FROM marks WHERE minute_epoch<?').bind(cutoff).run()
    ]));
  }
};
