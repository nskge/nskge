(() => {
  'use strict';
  const api=(window.NFC_SITE_CONFIG?.apiBase||'').replace(/\/$/,'');
  const $=id=>document.getElementById(id);
  const key=$('admin-key'),status=$('status'),totals=$('totals'),list=$('entries'),kind=$('kind'),more=$('more');
  let cursor=null,watchTimer=null,lastMark=null,watchKey='';
  const originalTitle=document.title;
  const text=(tag,s)=>{const el=document.createElement(tag);el.textContent=String(s);return el;};
  function sketch(drawing){
    const c=document.createElement('canvas');c.width=300;c.height=155;c.className='sketch';
    const ctx=c.getContext('2d');ctx.fillStyle='#09090c';ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle='#d5bdc6';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';
    if(!Array.isArray(drawing))return c;
    for(const stroke of drawing.slice(0,24)){
      if(!Array.isArray(stroke))continue;
      const points=stroke.slice(0,80).filter(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1));
      if(!points.length)continue;
      ctx.beginPath();ctx.moveTo(points[0][0]*c.width,points[0][1]*c.height);
      if(points.length===1)ctx.lineTo(points[0][0]*c.width+.1,points[0][1]*c.height+.1);
      else for(const p of points.slice(1))ctx.lineTo(p[0]*c.width,p[1]*c.height);
      ctx.stroke();
    }
    return c;
  }
  async function load(append=false){
    if(!/^https:\/\/[A-Za-z0-9.-]+$/.test(api)){status.textContent='Configure a API em /assets/config.js.';return;}
    if(!key.value||key.value.length>180){status.textContent='Informe a chave de acesso.';return;}
    status.textContent='carregando...';
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try {
      const type=kind.value==='messages'?'messages':'visits';
      const qs=append&&cursor?'?before='+encodeURIComponent(cursor):'';
      const response=await fetch(api+'/api/admin/'+type+qs,{headers:{Authorization:'Bearer '+key.value},cache:'no-store',signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Erro');
      if(!append)list.replaceChildren();
      totals.textContent=data.total.visitors+' visitantes • '+data.total.makers+' deixaram marca • '+data.total.visits+' aberturas • '+data.total.messages+' marcas';
      for(const entry of data.rows){
        const el=document.createElement('article');el.className='entry';
        const date=new Date(entry.time_utc);
        const when=Number.isNaN(date.valueOf())?'horário inválido':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'medium'});
        el.append(text('div',(type==='messages'?entry.name+' · ':'')+'#'+entry.visitor_id+' • '+when));
        el.append(text('small',entry.country+' • '+entry.os+' • '+entry.browser));
        if(type==='messages'){
          if(entry.message)el.append(text('p',entry.message));
          if(Array.isArray(entry.drawing)&&entry.drawing.length)el.append(sketch(entry.drawing));
        }
        list.append(el);
      }
      cursor=data.next;more.hidden=!cursor;
      status.textContent=data.rows.length?'logs carregados.':'nenhum registro ainda.';
    }catch(e){status.textContent=e.message||'Falha ao carregar.';}
    finally{clearTimeout(timeout);}
  }
  function stopWatching(){
    if(watchTimer!==null)clearInterval(watchTimer);
    watchTimer=null;lastMark=null;watchKey='';
    $('notify').textContent='Ativar avisos de novas marcas';
  }
  async function pollMarks(){
    if(!watchKey||key.value!==watchKey){stopWatching();return false;}
    try{
      const response=await fetch(api+'/api/admin/notifications',{
        headers:{Authorization:'Bearer '+watchKey},cache:'no-store'
      });
      if(!response.ok){stopWatching();status.textContent='Avisos parados: acesso não autorizado.';return false;}
      const data=await response.json();
      if(!Number.isSafeInteger(data.latest)||data.latest<0)throw Error('Resposta inválida.');
      if(lastMark!==null&&data.latest>lastMark){
        const howMany=data.latest-lastMark;
        const message=howMany===1?'Uma nova marca chegou.':howMany+' novas marcas chegaram.';
        status.textContent=message;
        document.title='● '+originalTitle;
        if('Notification' in window&&Notification.permission==='granted'){
          try{new Notification('Nova marca no site',{body:message,tag:'nfc-nova-marca'});}catch{}
        }
      }
      lastMark=data.latest;
      return true;
    }catch{status.textContent='Não foi possível verificar novas marcas agora.';return false;}
  }
  $('notify').addEventListener('click',async()=>{
    if(watchTimer!==null){stopWatching();status.textContent='Avisos desativados.';return;}
    if(!/^https:\/\/[A-Za-z0-9.-]+$/.test(api)||!key.value){status.textContent='Configure a API e informe sua chave.';return;}
    if('Notification' in window&&Notification.permission==='default')await Notification.requestPermission();
    watchKey=key.value;
    if(!await pollMarks()){stopWatching();return;}
    watchTimer=setInterval(pollMarks,45000);
    $('notify').textContent='Desativar avisos';
    status.textContent='Avisos ligados enquanto este painel estiver aberto.';
  });
  $('logout').addEventListener('click',()=>{
    stopWatching();key.value='';cursor=null;list.replaceChildren();totals.textContent='';more.hidden=true;
    document.title=originalTitle;status.textContent='Sessão encerrada neste painel.';
  });
  $('load').addEventListener('click',()=>load(false));
  more.addEventListener('click',()=>load(true));
  kind.addEventListener('change',()=>{cursor=null;list.replaceChildren();more.hidden=true;});
})();
