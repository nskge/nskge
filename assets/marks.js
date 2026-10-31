(() => {
  'use strict';
  const api=(window.NFC_SITE_CONFIG?.apiBase||'').replace(/\/$/,'');
  const $=id=>document.getElementById(id);
  const writeTab=$('tab-write'),peopleTab=$('tab-people');
  const writePanel=$('write-panel'),peoplePanel=$('people-panel');
  const closeWrite=$('close-write'),closePeople=$('close-people');
  const status=$('people-status'),list=$('people-list'),more=$('people-more');
  let cursor=null,loading=false;

  function sketch(drawing){
    const c=document.createElement('canvas');c.width=300;c.height=155;
    c.setAttribute('aria-label','Desenho enviado');
    const ctx=c.getContext('2d');
    ctx.fillStyle='#09090c';ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle='#eeeeee';ctx.fillStyle='#eeeeee';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';
    if(!Array.isArray(drawing))return c;
    for(const stroke of drawing.slice(0,24)){
      if(!Array.isArray(stroke))continue;
      const points=stroke.slice(0,80).filter(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1));
      if(!points.length)continue;
      if(points.length===1){ctx.beginPath();ctx.arc(points[0][0]*c.width,points[0][1]*c.height,1.5,0,2*Math.PI);ctx.fill();continue;}
      ctx.beginPath();ctx.moveTo(points[0][0]*c.width,points[0][1]*c.height);
      for(const p of points.slice(1))ctx.lineTo(p[0]*c.width,p[1]*c.height);
      ctx.stroke();
    }
    return c;
  }
  function markCard(entry){
    const card=document.createElement('article');card.className='people-card';
    const name=document.createElement('strong');name.textContent=String(entry.name||'anônimo');card.append(name);
    if(entry.message){const p=document.createElement('p');p.textContent=String(entry.message);card.append(p);}
    if(Array.isArray(entry.drawing)&&entry.drawing.length)card.append(sketch(entry.drawing));
    return card;
  }
  async function load(append=false){
    if(loading)return;
    if(!/^https:\/\/[A-Za-z0-9.-]+$/.test(api)){status.textContent='Mural indisponível.';return;}
    loading=true;more.disabled=true;status.textContent='carregando mensagens...';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const query=append&&cursor?'?before='+encodeURIComponent(String(cursor)):'';
      const response=await fetch(api+'/api/marks'+query,{mode:'cors',cache:'no-store',signal:controller.signal});
      const data=await response.json();
      if(!response.ok||!Array.isArray(data.rows))throw Error('Não foi possível carregar as marcas.');
      if(!append)list.replaceChildren();
      for(const entry of data.rows.slice(0,20))list.append(markCard(entry));
      cursor=Number.isSafeInteger(data.next)&&data.next>0?data.next:null;
      more.hidden=!cursor;
      status.textContent=list.children.length?'mensagens deixadas por aqui':'ninguém deixou mensagem ainda.';
    }catch{status.textContent='Não foi possível carregar as marcas agora.';}
    finally{clearTimeout(timer);loading=false;more.disabled=false;}
  }
  function show(people){
    writeTab.setAttribute('aria-selected',String(!people));peopleTab.setAttribute('aria-selected',String(people));
    writePanel.hidden=people;peoplePanel.hidden=!people;document.body.classList.add('panel-open');
    (people?closePeople:closeWrite).focus();
    if(people)load(false);
  }
  function close(panel){
    writePanel.hidden=true;peoplePanel.hidden=true;document.body.classList.remove('panel-open');
    writeTab.setAttribute('aria-selected','false');peopleTab.setAttribute('aria-selected','false');
    (panel==='people'?peopleTab:writeTab).focus();
  }
  writeTab.addEventListener('click',()=>show(false));
  peopleTab.addEventListener('click',()=>show(true));
  for(const tab of [writeTab,peopleTab])tab.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      e.preventDefault();const people=tab===writeTab;show(people);(people?peopleTab:writeTab).focus();
    }
  });
  closeWrite.addEventListener('click',()=>close('write'));
  closePeople.addEventListener('click',()=>close('people'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('panel-open'))close(peoplePanel.hidden?'write':'people');});
  more.addEventListener('click',()=>load(true));
})();
