import {money,oceans,periodPlayers,groups,validate,sorted,escapeText as esc,poster} from './model.mjs';
const $=id=>document.getElementById(id);
let data,slide='school',period='all';
let posterFontCss;
const title={school:'MIT vs Harvard',year:'First years vs second years',ocean:'The oceans'};
const tone=n=>n>0?'up':n<0?'down':'neutral';
const formatDate=d=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
function periodLabel(){return period==='all'?'Total standings':period==='opening'?'Before October 2':formatDate(data.games.find(g=>g.id===period).date);}
function bar(net,max){return `<div class="bar-field" aria-hidden="true"><div class="bar ${net<0?'negative':'positive'}" style="width:${Math.abs(net??0)/max*50}%"></div></div>`;}
function axis(max,ocean=false){return `<div class="axis ${ocean?'ocean-axis':''}" aria-hidden="true"><span></span><div><span>${money(-max)}</span><span>0</span><span>${money(max)}</span></div><span></span></div>`;}
function renderPanel(){
  const players=periodPlayers(data,period), set=groups(players,slide), ocean=slide==='ocean',max=Math.max(100,...set.map(g=>Math.abs(g.net??0)));
  const bars=set.map(g=>`<div class="diverging"><span class="ocean-name">${esc(g.name)}${ocean?`<small>${g.count} ${g.count===1?'player':'players'}</small>`:''}</span>${bar(g.net,max)}<span class="${tone(g.net)}">${money(g.net)}</span></div>`).join('');
  const pair=ocean?'':`<div class="pair">${set.map(g=>`<div><span class="group-name">${g.name}</span><strong class="group-total ${tone(g.net)}">${money(g.net)}</strong><span class="group-count">${g.count} ${g.count===1?'player':'players'} at the table</span></div>`).join('')}</div>`;
  $('panel').innerHTML=`<p class="panel-kicker">${ocean?'Six oceans. One table.':slide==='year'?'MIT · Class rivalry':'The Cambridge rivalry'}</p><div class="panel-heading"><h3>${title[slide]}</h3><span>${periodLabel()}</span></div>${pair}<div class="group-bars ${ocean?'ocean-bars':''}">${bars}</div>${axis(max,ocean)}`;
  $('panel').setAttribute('aria-labelledby','tab-'+slide);
  $('slide-note').textContent=slide==='school'?'Group totals across the players shown. Player counts are shown because the two sides have different numbers of players.':slide==='year'?'MIT students only. First and second years follow the recorded cohort for this season.':'MIT students only. Each player’s net contributes to their Sloan ocean; Harvard appears in the school rivalry.';
}
function renderRanking(){
  const all=periodPlayers(data,period), max=Math.max(100,...all.map(p=>Math.abs(p.net))), rankMap=new Map(sorted(all).map((p,i)=>[p.id,i+1]));
  const players=sorted(all).filter(p=>($('school-filter').value==='all'||p.school===$('school-filter').value)&&($('year-filter').value==='all'||p.school==='MIT'&&String(p.year)===$('year-filter').value)&&($('ocean-filter').value==='all'||p.ocean===$('ocean-filter').value));
  $('ranking').innerHTML=players.map(p=>`<li><div class="player"><span class="rank">${String(rankMap.get(p.id)).padStart(2,'0')}</span><span class="player-name">${esc(p.name)}<small class="player-detail">${esc(p.school)}${p.year?' · Year '+p.year:''}${p.school==='MIT'&&p.ocean?' · '+esc(p.ocean):''}</small></span></div>${bar(p.net,max)}<span class="player-net ${tone(p.net)}">${money(p.net)}</span></li>`).join('')||'<li class="empty">No players in this group for this period.</li>';
  $('filter-count').textContent=`${players.length} of ${all.length} players`;
}
function setSlide(next,{focus=false}={}) {
  if(!title[next])next='school';slide=next;
  for(const button of document.querySelectorAll('[role="tab"]')){const active=button.dataset.slide===slide;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();}
  renderPanel();const url=new URL(location.href);url.searchParams.set('view',slide);if(period==='all')url.searchParams.delete('period');else url.searchParams.set('period',period);history.replaceState(null,'',url);
}
function renderLatest(){
  const game=data.games.find(g=>g.id===data.latest_game_id),players=sorted(periodPlayers(data,game.id)),net=players.reduce((s,p)=>s+p.net,0),winnings=players.reduce((s,p)=>s+Math.max(p.net,0),0),losses=-players.reduce((s,p)=>s+Math.min(p.net,0),0);
  $('latest-title').textContent=formatDate(game.date);$('latest-link').textContent=formatDate(game.date)+' game ↗';
  $('balance').textContent=net===0?'BALANCED · $0.00':'NEEDS REVIEW';
  $('game-summary').innerHTML=`<div><span>At the table</span><strong>${players.length} players</strong></div><div><span>Total winnings</span><strong class="up">${money(winnings,{signed:false})}</strong></div><div><span>Total losses</span><strong class="down">${money(losses,{signed:false})}</strong></div>`;
  $('game-results').innerHTML=players.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.school)}</td><td class="${tone(p.net)}">${money(p.net)}</td></tr>`).join('');$('game-total').textContent=money(net);
}
async function download(){
  $('download').disabled=true;$('action-status').textContent='Preparing your slide…';
  try{
    if(!posterFontCss){
      const response=await fetch('./fonts/jakarta-regular.ttf');if(!response.ok)throw new Error('Could not load the site font');
      const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
      posterFontCss=`@font-face{font-family:Jakarta;src:url(data:font/ttf;base64,${btoa(binary)}) format('truetype');font-weight:400;}`;
    }
    const svg=poster(periodPlayers(data,period),slide,periodLabel(),formatDate(data.latest_game_date),posterFontCss);const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));const image=new Image();
    try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;canvas.getContext('2d').drawImage(image,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not create image');const out=URL.createObjectURL(blob);const a=document.createElement('a');a.href=out;a.download=`cambridge-holdem-${slide}-${period==='all'?'total':period==='opening'?'opening':data.games.find(g=>g.id===period).date}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(out),1000);}finally{URL.revokeObjectURL(url);}
    $('action-status').textContent='Slide saved. Ready to send around.';
  }catch(e){$('action-status').textContent='Could not save the image. You can still copy this page’s link.';}finally{$('download').disabled=false;}
}
try{
  const response=await fetch('./standings.json',{cache:'no-cache'});if(!response.ok)throw new Error('Could not load standings');data=validate(await response.json());
  const params=new URL(location.href).searchParams;period=params.get('period')||'all';if(!['all','opening',...data.games.map(g=>g.id)].includes(period))period='all';
  $('period').innerHTML='<option value="all">All standings</option>'+data.games.map(g=>`<option value="${esc(g.id)}">${formatDate(g.date)}</option>`).join('')+'<option value="opening">Before October 2</option>';$('period').value=period;
  $('ocean-filter').innerHTML='<option value="all">All oceans</option>'+oceans.map(o=>`<option>${o}</option>`).join('');
  $('asof').textContent='Through '+formatDate(data.latest_game_date);$('source-note').textContent=data.note+' Updated '+formatDate(data.updated)+'.';
  $('period').addEventListener('change',()=>{period=$('period').value;setSlide(slide);renderRanking();});
  for(const button of document.querySelectorAll('[role="tab"]')){button.addEventListener('click',()=>setSlide(button.dataset.slide));button.addEventListener('keydown',e=>{const list=['school','year','ocean'],i=list.indexOf(slide);if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();setSlide(e.key==='Home'?list[0]:e.key==='End'?list[2]:list[(i+(e.key==='ArrowRight'?1:2))%3],{focus:true});}});}
  for(const id of ['school-filter','year-filter','ocean-filter'])$(id).addEventListener('change',renderRanking);
  $('download').addEventListener('click',download);$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);$('action-status').textContent='Link copied. Send it to the table.';}catch{ $('action-status').textContent='Copy the link from your browser’s address bar.';}});
  renderLatest();setSlide(params.get('view')||'school');renderRanking();$('loading').hidden=true;$('content').hidden=false;
}catch(e){$('loading').textContent='Standings are unavailable right now. Please reload to try again.';console.error(e);}
