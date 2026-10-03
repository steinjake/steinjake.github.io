import {money,oceans,periodPlayers,groups,validatePublic,decryptMembers,sorted,escapeText as esc,poster} from './model.mjs';
const $=id=>document.getElementById(id);
let data,members=null,posterFontCss;
const tone=n=>n>0?'up':n<0?'down':'neutral';
const formatDate=d=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
const current=()=>data.totals;
function bar(net,max){return `<div class="bar-field" aria-hidden="true"><div class="bar ${net<0?'negative':'positive'}" style="width:${Math.abs(net??0)/max*50}%"></div></div>`;}
function renderComparisons(){
  const set=current(),pair=(values,kind)=>`<div class="pair ${kind}-pair">${values.map(g=>`<div class="${tone(g.net)} ${kind==='school'?'school-'+g.name:''}"><span class="group-name">${esc(g.name)}</span><strong class="group-total">${money(g.net)}</strong><span class="total-rule" aria-hidden="true"></span></div>`).join('')}</div>`;
  const max=Math.max(100,...set.ocean.map(g=>Math.abs(g.net??0)));
  const ocean=set.ocean.map(g=>`<div class="diverging"><span>${esc(g.name)}</span>${bar(g.net,max)}<span class="${tone(g.net)}">${money(g.net)}</span></div>`).join('');
  $('comparisons').innerHTML=`
    <section class="comparison" aria-labelledby="school-title"><div class="comparison-heading"><h3 id="school-title">MIT vs Harvard</h3></div>${pair(set.school,'school')}</section>
    <section class="comparison" aria-labelledby="year-title"><div class="comparison-heading"><h3 id="year-title">First-year vs second-year MBAs</h3></div>${pair(set.year,'year')}</section>
    <section class="comparison" aria-labelledby="ocean-title"><div class="comparison-heading"><h3 id="ocean-title">The oceans</h3><p class="scope">MIT only</p></div><div class="ocean-bars">${ocean}</div><div class="axis ocean-axis" aria-hidden="true"><span></span><div><span>${money(-max)}</span><span>0</span><span>${money(max)}</span></div><span></span></div></section>`;
  const mit=set.school[0].net;
  document.querySelector('.share p').textContent=`Net winnings / losses in USD. Class years include MIT and Harvard. Oceans sum to MIT’s ${money(mit)}.`;
}
function renderRanking(){
  if(!members)return;
  const all=periodPlayers(members),max=Math.max(100,...all.map(p=>Math.abs(p.net))),ranks=new Map(sorted(all).map((p,i)=>[p.id,i+1]));
  const players=sorted(all).filter(p=>($('school-filter').value==='all'||p.school===$('school-filter').value)&&($('year-filter').value==='all'||String(p.year)===$('year-filter').value)&&($('ocean-filter').value==='all'||p.ocean===$('ocean-filter').value));
  $('ranking').innerHTML=players.map(p=>`<li><div class="player"><span class="rank">${ranks.get(p.id)}</span><span class="player-name">${esc(p.name)}<small class="player-detail">${esc(p.school)}${p.year?' · Year '+p.year:''}${p.school==='MIT'&&p.ocean?' · '+esc(p.ocean):''}</small></span></div>${bar(p.net,max)}<span class="player-net ${tone(p.net)}">${money(p.net)}</span></li>`).join('')||'<li class="empty">No recorded results in this group.</li>';
}
function renderLatest(){
  const game=members.games.find(g=>g.id===members.latest_game_id),players=sorted(periodPlayers(members,game.id)),net=players.reduce((s,p)=>s+p.net,0),winnings=players.reduce((s,p)=>s+Math.max(p.net,0),0),losses=-players.reduce((s,p)=>s+Math.min(p.net,0),0);
  $('latest-title').textContent=formatDate(game.date);$('latest-link').textContent=formatDate(game.date)+' game ↗';
  $('balance').textContent=net===0?'BALANCED · $0.00':'NEEDS REVIEW';
  $('game-summary').innerHTML=`<div><span>Total winnings</span><strong class="up">${money(winnings,{signed:false})}</strong></div><div><span>Total losses</span><strong class="down">${money(losses,{signed:false})}</strong></div>`;
  $('game-results').innerHTML=players.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.school)}</td><td class="${tone(p.net)}">${money(p.net)}</td></tr>`).join('');$('game-total').textContent=money(net);
}
function renderPage(){
  clearDownload('download-ready');clearDownload('download-players-ready');$('action-status').textContent='';
  renderComparisons();renderRanking();
  const url=new URL(location.href);url.searchParams.delete('view');url.searchParams.delete('period');history.replaceState(null,'',url);
}
async function unlock(event){
  event.preventDefault();$('unlock').disabled=true;$('unlock-status').textContent='Unlocking…';
  let password=$('group-password').value;$('group-password').value='';
  try{
    const response=await fetch('./members.enc.json',{cache:'no-cache'});if(!response.ok)throw new Error('Encrypted standings unavailable');
    const decoded=await decryptMembers(await response.json(),password);
    if(decoded.updated!==data.updated||decoded.latest_game_date!==data.latest_game_date)throw new Error('Standings versions differ');
    for(const kind of ['school','year','ocean']){
      const totals=groups(periodPlayers(decoded),kind).map(({name,net})=>({name,net}));
      if(JSON.stringify(totals)!==JSON.stringify(data.totals[kind]))throw new Error('Standings versions differ');
    }
    members=decoded;renderRanking();renderLatest();$('member-gate').hidden=true;$('member-content').hidden=false;$('unlock-status').textContent='';$('lock').focus();
  }catch{
    $('unlock-status').textContent='That password didn’t unlock the leaderboard. Check with the group and try again.';$('group-password').focus();
  }finally{password='';$('unlock').disabled=false;}
}
function lock(){
  members=null;$('member-content').hidden=true;$('member-gate').hidden=false;
  clearDownload('download-players-ready');
  for(const id of ['ranking','game-results','game-summary','latest-title','game-total','balance'])$(id).replaceChildren();
  $('latest-link').textContent='Latest game ↗';$('action-status').textContent='';$('group-password').value='';$('group-password').focus();
}
function clearDownload(id){
  const link=$(id);if(link.getAttribute('href')?.startsWith('blob:'))URL.revokeObjectURL(link.href);link.removeAttribute('href');link.hidden=true;
}
async function fontCss(){
  if(posterFontCss)return posterFontCss;
  const faces=await Promise.all([['source-sans-regular.ttf','ClubSans',400],['source-sans-semibold.ttf','ClubSans',600],['source-serif-display.ttf','ClubSerif',400]].map(async([file,family,weight])=>{
    const response=await fetch(`./fonts/${file}`);if(!response.ok)throw new Error('Could not load site font');
    const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return `@font-face{font-family:${family};src:url(data:font/ttf;base64,${btoa(binary)}) format('truetype');font-weight:${weight};}`;
  }));posterFontCss=faces.join('');return posterFontCss;
}
async function download(playerView=false){
  if(playerView&&!members)return;
  if(!playerView){
    clearDownload('download-ready');const link=$('download-ready');
    link.href='./images/cambridge-holdem-breakdown-total.png';link.download='cambridge-holdem-breakdown-total.png';link.hidden=false;link.click();
    $('action-status').textContent='Image ready. Use the download link to save it.';return;
  }
  const button=$(playerView?'download-players':'download');button.disabled=true;$('action-status').textContent='Preparing your image…';
  try{
    const css=await fontCss(),svg=poster(periodPlayers(members),'school','Total standings',formatDate(data.latest_game_date),css);
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),image=new Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;canvas.getContext('2d').drawImage(image,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not create image');
      const id='download-players-ready';clearDownload(id);const link=$(id);link.href=URL.createObjectURL(blob);link.download='cambridge-holdem-players-total.png';link.hidden=false;link.click();
    }finally{URL.revokeObjectURL(url);}
    $('action-status').textContent='Image ready. Use the download link to save it.';
  }catch{$('action-status').textContent='Could not save the image. You can still copy this page’s link.';}finally{button.disabled=false;}
}
try{
  const response=await fetch('./standings.json',{cache:'no-cache'});if(!response.ok)throw new Error('Could not load standings');data=validatePublic(await response.json());
  $('ocean-filter').innerHTML='<option value="all">All oceans</option>'+oceans.map(o=>`<option>${o}</option>`).join('');
  $('asof').textContent='Through '+formatDate(data.latest_game_date);$('source-note').textContent=data.note+' Updated '+formatDate(data.updated)+'.';
  for(const id of ['school-filter','year-filter','ocean-filter'])$(id).addEventListener('change',renderRanking);
  $('unlock-form').addEventListener('submit',unlock);$('lock').addEventListener('click',lock);
  $('download').addEventListener('click',()=>download());$('download-players').addEventListener('click',()=>download(true));
  $('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);$('action-status').textContent='Link copied. Send it to the table.';}catch{$('action-status').textContent='Copy the link from your browser’s address bar.';}});
  renderPage();$('loading').hidden=true;$('content').hidden=false;
}catch(e){$('loading').textContent='Standings are unavailable right now. Please reload to try again.';console.error(e);}
