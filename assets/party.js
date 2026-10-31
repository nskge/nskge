(() => {
  'use strict';
  const MAX_STROKES=24, MAX_POINTS=350, MAX_PER_STROKE=80;
  const api=(window.NFC_SITE_CONFIG?.apiBase||'').replace(/\/$/, '');
  const $=id=>document.getElementById(id);
  const canvas=$('draw'),ctx=canvas.getContext('2d',{alpha:false});
  const input=$('message'),count=$('count'),status=$('submit-status'),button=$('send-mark'),counter=$('visitor-count');
  let lines=[],drawing=false,token='',widget=null,ready=false;
  let visitorId;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  try {
    visitorId=localStorage.getItem('0x0krr.anon.v1');
    if(!uuid.test(visitorId||'')){visitorId=crypto.randomUUID();localStorage.setItem('0x0krr.anon.v1',visitorId);}
  }catch{visitorId=crypto.randomUUID();}
  const say=s=>{status.textContent=s;};
  const clamp=x=>Math.max(0,Math.min(1,x));
  const pos=e=>{const b=canvas.getBoundingClientRect();return [clamp((e.clientX-b.left)/b.width),clamp((e.clientY-b.top)/b.height)];};
  const pointCount=()=>lines.reduce((n,x)=>n+x.length,0);
  function redraw(){
    const w=canvas.width,h=canvas.height;ctx.fillStyle='#09090c';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#d5bdc6';ctx.fillStyle='#d5bdc6';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';
    for(const line of lines){
      if(!line.length)continue;
      if(line.length===1){ctx.beginPath();ctx.arc(line[0][0]*w,line[0][1]*h,1.7,0,2*Math.PI);ctx.fill();}
      else{ctx.beginPath();ctx.moveTo(line[0][0]*w,line[0][1]*h);for(const p of line.slice(1))ctx.lineTo(p[0]*w,p[1]*h);ctx.stroke();}
    }
  }
  canvas.addEventListener('pointerdown',e=>{
    if(lines.length>=MAX_STROKES||pointCount()>=MAX_POINTS)return;
    e.preventDefault();canvas.setPointerCapture(e.pointerId);lines.push([pos(e)]);drawing=true;redraw();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drawing)return;const line=lines.at(-1),p=pos(e),prev=line.at(-1);
    if(line.length>=MAX_PER_STROKE||pointCount()>=MAX_POINTS)return;
    if(Math.hypot(p[0]-prev[0],p[1]-prev[1])>.008){line.push(p);redraw();}
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drawing=false;});
  $('undo').addEventListener('click',()=>{lines.pop();redraw();});
  $('clear').addEventListener('click',()=>{lines=[];redraw();});
  input.addEventListener('input',()=>{
    if(Array.from(input.value).length>140)input.value=Array.from(input.value).slice(0,140).join('');
    count.textContent=Array.from(input.value).length+'/140';
  });
  redraw();
  async function call(path,data){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7500);
    try{
      const r=await fetch(api+path,{method:data?'POST':'GET',mode:'cors',cache:'no-store',signal:controller.signal,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
      const result=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(result.error||'Serviço indisponível.');
      return result;
    }finally{clearTimeout(timeout);}
  }
  const reset=()=>{token='';if(widget!==null&&window.turnstile)window.turnstile.reset(widget);};
  window.partyTurnstileLoaded=()=>{
    if(!ready||!window.turnstile||widget!==null)return;
    widget=window.turnstile.render('#turnstile',{
      sitekey:window.partyTurnstileKey,theme:'dark',size:'flexible',action:'message',
      callback:t=>{token=t;},'expired-callback':()=>{token='';},
      'error-callback':()=>{token='';say('Verificação indisponível. Tente de novo.');}
    });
  };
  button.addEventListener('click',async()=>{
    if(!ready){say('Recados ainda não estão ativados.');return;}
    const message=input.value.trim();
    if(!message&&!lines.length){say('Escreva ou desenhe alguma coisa.');return;}
    if(!token){say('Conclua a verificação antispam primeiro.');return;}
    button.disabled=true;say('enviando...');
    try{
      await call('/api/mark',{visitorId,message,drawing:lines,website:$('website').value,turnstile:token});
      input.value='';count.textContent='0/140';lines=[];redraw();say('sua marca foi salva.');
    }catch(e){say(e.message||'Não foi possível enviar.');}
    finally{button.disabled=false;reset();}
  });
  async function init(){
    if(!/^https:\/\/[A-Za-z0-9.-]+$/.test(api)){button.disabled=true;say('recados em configuração');return;}
    try{
      const config=await call('/api/config');
      if(!config.enabled||typeof config.siteKey!=='string'||!/^[A-Za-z0-9_-]+$/.test(config.siteKey))throw Error();
      ready=true;button.disabled=false;say('pode escrever ou desenhar sua marca.');
      window.partyTurnstileKey=config.siteKey;
      const script=document.createElement('script');
      script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=partyTurnstileLoaded&render=explicit';
      script.async=true;script.defer=true;document.head.append(script);
      const v=await call('/api/visit',{visitorId});
      counter.textContent=Number(v.visitors).toLocaleString('pt-BR')+' pessoas passaram aqui';
      counter.hidden=false;
    }catch{button.disabled=true;say('recados temporariamente indisponíveis.');}
  }
  init();
})();