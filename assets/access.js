(() => {
  'use strict';
  const api=(window.NFC_SITE_CONFIG?.apiBase||'').replace(/\/$/,'');
  const gate=document.getElementById('access-gate'),main=document.querySelector('main');
  const password=document.getElementById('access-password'),button=document.getElementById('access-submit'),status=document.getElementById('access-status');
  let challenge='',widget=null,resolved=false,resolveReady;
  const access={token:'',ready:new Promise(resolve=>{resolveReady=resolve;})};window.NFC_ACCESS=access;
  const headers=token=>({'X-Site-Access':token});
  function unlock(token){access.token=token;sessionStorage.setItem('0x0krr.access.v1',token);gate.hidden=true;main.inert=false;if(!resolved){resolved=true;resolveReady(token);}}
  function lock(){access.token='';sessionStorage.removeItem('0x0krr.access.v1');gate.hidden=false;main.inert=true;password.value='';status.textContent='digite a senha para entrar.';}
  access.lock=lock;
  async function verify(token){try{const r=await fetch(api+'/api/access',{headers:headers(token),cache:'no-store'});return r.ok;}catch{return false;}}
  window.accessTurnstileLoaded=()=>{if(widget!==null||!window.turnstile)return;widget=turnstile.render('#access-turnstile',{sitekey:window.partyTurnstileKey,theme:'dark',size:'flexible',action:'access',callback:t=>{challenge=t;},'expired-callback':()=>{challenge='';}});};
  button.addEventListener('click',async()=>{
    if(!password.value||!challenge){status.textContent='digite a senha e conclua a verificação.';return;}
    button.disabled=true;status.textContent='verificando...';
    try{
      const r=await fetch(api+'/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.value,turnstile:challenge,website:document.getElementById('access-website').value}),cache:'no-store'});
      const data=await r.json().catch(()=>({}));password.value='';
      if(!r.ok||typeof data.token!=='string')throw Error(data.error||'Não foi possível entrar.');
      unlock(data.token);
    }catch(e){status.textContent=e.message||'Não foi possível entrar.';challenge='';if(widget!==null&&window.turnstile)turnstile.reset(widget);}
    finally{button.disabled=false;}
  });
  password.addEventListener('keydown',e=>{if(e.key==='Enter')button.click();});
  (async()=>{
    if(!/^https:\/\/[A-Za-z0-9.-]+$/.test(api)){status.textContent='acesso indisponível.';return;}
    const saved=sessionStorage.getItem('0x0krr.access.v1')||'';if(saved&&await verify(saved)){unlock(saved);return;}lock();
    try{
      const r=await fetch(api+'/api/config',{cache:'no-store'}),data=await r.json();
      if(!r.ok||typeof data.siteKey!=='string')throw Error();window.partyTurnstileKey=data.siteKey;
      const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=accessTurnstileLoaded&render=explicit';script.async=true;script.defer=true;document.head.append(script);
    }catch{status.textContent='acesso temporariamente indisponível.';}
  })();
})();
