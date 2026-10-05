import {decryptBundle} from './crypto.mjs';
const $=id=>document.getElementById(id);
let pages=null,frame=null,nonce=null,downloadLinks=new Map(),tileRequests=new Map();
function hideFrame(){for(const request of tileRequests.values())request.abort();tileRequests.clear();if(frame){frame.srcdoc='';frame.remove();frame=null;}for(const link of downloadLinks.values())URL.revokeObjectURL(link.href);downloadLinks.clear();$('file-nav').replaceChildren();nonce=null;$('frame-holder').replaceChildren();}
function directory(){hideFrame();$('viewer').hidden=true;$('directory').hidden=false;$('shell-footer').hidden=false;history.replaceState(null,'',location.pathname);$('search').focus();}
function renderCards(){
  const query=$('search').value.trim().toLowerCase();
  const matches=pages.filter(p=>[p.title,p.description,...p.tags].join(' ').toLowerCase().includes(query));
  $('cards').replaceChildren(...matches.map(page=>{
    const card=document.createElement('button');card.type='button';card.className='card';
    const tags=document.createElement('span');tags.className='tags';tags.textContent=page.tags.join(' · ');
    const title=document.createElement('strong');title.textContent=page.title;
    const description=document.createElement('p');description.textContent=page.description;
    const open=document.createElement('span');open.className='open';open.textContent='Open page →';
    card.append(tags,title,description,open);card.addEventListener('click',()=>openPage(page.id));return card;
  }));$('empty').hidden=Boolean(matches.length);
}
function openPage(id){
  const page=pages.find(p=>p.id===id);if(!page)return;
  hideFrame();nonce=crypto.randomUUID();
  for(const [name,file] of Object.entries(page.files||{})){
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([file.text],{type:file.type}));link.download=name;
    link.textContent=name.includes('-park.gpx')?'Park-finish GPX ↓':name.includes('-street.gpx')?'Sidewalk-finish GPX ↓':name;
    downloadLinks.set(name,link);if(name.endsWith('.gpx'))$('file-nav').append(link);
  }
  // The encrypted document contains a hashed script that accepts this one-time
  // nonce through window.name. No script is injected into the protected page.
  frame=document.createElement('iframe');frame.title=page.title;frame.name=nonce;
  frame.setAttribute('sandbox','allow-scripts allow-downloads');frame.referrerPolicy='origin';frame.srcdoc=page.html;
  $('frame-holder').append(frame);$('page-title').textContent=page.title;
  $('directory').hidden=true;$('viewer').hidden=false;$('shell-footer').hidden=true;
  history.replaceState(null,'',location.pathname+'#'+page.id);window.scrollTo(0,0);
}
function lock(){hideFrame();pages=null;$('cards').replaceChildren();$('search').value='';$('page-title').textContent='';$('password').value='';$('password').type='password';$('show-password').textContent='Show';$('show-password').setAttribute('aria-label','Show password');$('show-password').setAttribute('aria-pressed','false');$('directory').hidden=true;$('viewer').hidden=true;$('gate').hidden=false;$('lock').hidden=true;$('shell-footer').hidden=false;$('status').textContent='Your pages are encrypted. Unlock them here.';$('password').focus();}
$('unlock-form').addEventListener('submit',async event=>{
  event.preventDefault();let password=$('password').value;$('password').value='';$('unlock').disabled=true;$('status').textContent='Unlocking…';
  try{
    if(!crypto?.subtle)throw new Error('Secure connection required');
    const response=await fetch('bundle.enc.json',{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw new Error('Private pages unavailable');
    pages=(await decryptBundle(await response.json(),password)).pages;
    $('gate').hidden=true;$('directory').hidden=false;$('lock').hidden=false;renderCards();
    const requested=location.hash.slice(1);if(pages.some(p=>p.id===requested))openPage(requested);else $('search').focus();
  }catch{pages=null;$('status').textContent='That password didn’t unlock the pages. Try again.';$('password').focus();}
  finally{password='';$('unlock').disabled=false;}
});
$('show-password').addEventListener('click',()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('show-password').textContent=show?'Hide':'Show';$('show-password').setAttribute('aria-label',show?'Hide password':'Show password');$('show-password').setAttribute('aria-pressed',String(show));});
$('search').addEventListener('input',renderCards);$('back').addEventListener('click',directory);$('lock').addEventListener('click',lock);
window.addEventListener('message',event=>{
  if(!frame||event.source!==frame.contentWindow||event.data?.nonce!==nonce)return;
  if(event.data.kind==='private-map-tile'){
    const {requestId,z,x,y}=event.data;
    if(!Number.isSafeInteger(requestId)||requestId<1||![z,x,y].every(Number.isInteger)||z<0||z>19||x<0||y<0||x>=2**z||y>=2**z||tileRequests.has(requestId))return;
    const controller=new AbortController(),target=frame.contentWindow,requestNonce=nonce;
    tileRequests.set(requestId,controller);
    // Fetch from the real website origin, rather than the opaque sandbox. Keep
    // normal HTTP caching and identify the site with an origin-only Referer.
    fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`,{signal:controller.signal,credentials:'omit',referrerPolicy:'origin'}).then(async response=>{
      if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('Map tile unavailable');
      const tile=await response.blob();
      if(nonce===requestNonce)target.postMessage({kind:'private-map-tile-result',nonce:requestNonce,requestId,tile},'*');
    }).catch(error=>{
      if(error.name!=='AbortError'&&nonce===requestNonce)target.postMessage({kind:'private-map-tile-result',nonce:requestNonce,requestId,failed:true},'*');
    }).finally(()=>{if(tileRequests.get(requestId)===controller)tileRequests.delete(requestId);});
  }
  if(event.data.kind==='private-map-tile-cancel'){tileRequests.get(event.data.requestId)?.abort();tileRequests.delete(event.data.requestId);}
  if(event.data.kind==='private-page-height'&&Number.isFinite(event.data.height))frame.style.height=Math.min(30000,Math.max(700,event.data.height+4))+'px';
  if(event.data.kind==='private-page-download'){const link=downloadLinks.get(event.data.file);if(link){if(!link.isConnected)$('file-nav').append(link);link.click();}}
});
window.addEventListener('pagehide',lock);
