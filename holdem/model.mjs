export const oceans=['Atlantic','Caribbean','Mediterranean','Baltic','Indian','Pacific'];
export function money(cents,{signed=true}={}) {
  if(!Number.isSafeInteger(cents)) return '—';
  return (cents<0?'−':signed&&cents>0?'+':'')+'$'+(Math.abs(cents)/100).toFixed(2);
}
export function periodPlayers(data,period='all') {
  if(period==='all')return data.players.map(p=>({...p,net:p.total_cents}));
  if(period==='opening')return data.players.filter(p=>p.opening_cents!==null).map(p=>({...p,net:p.opening_cents}));
  const game=data.games.find(g=>g.id===period);
  if(!game)throw new Error('Unknown game');
  const results=new Map(game.results.map(r=>[r.player_id,r.net_cents]));
  return data.players.filter(p=>results.has(p.id)).map(p=>({...p,net:results.get(p.id)}));
}
export function groups(players,kind) {
  const specs=kind==='school'?[['MIT',p=>p.school==='MIT'],['Harvard',p=>p.school==='Harvard']]:kind==='year'?[['First years',p=>p.school==='MIT'&&p.year===1],['Second years',p=>p.school==='MIT'&&p.year===2]]:oceans.map(o=>[o,p=>p.school==='MIT'&&p.ocean===o]);
  return specs.map(([name,match])=>{const members=players.filter(match);return{name,count:members.length,net:members.length?members.reduce((s,p)=>s+p.net,0):null};});
}
export function validate(data) {
  if(data.schema_version!==1||!data.players.length||!data.games.length)throw new Error('Standings unavailable');
  const ids=new Set();
  for(const p of data.players){if(ids.has(p.id)||!Number.isSafeInteger(p.total_cents)||!(p.opening_cents===null||Number.isSafeInteger(p.opening_cents)))throw new Error('Invalid player results');ids.add(p.id);}
  const opening=data.players.reduce((s,p)=>s+(p.opening_cents??0),0);
  if(opening!==0)throw new Error('Opening standings do not balance');
  const gameIds=new Set();
  const totals=new Map(data.players.map(p=>[p.id,p.opening_cents??0]));
  for(const g of data.games){
    const seen=new Set();if(gameIds.has(g.id))throw new Error('Duplicate game');gameIds.add(g.id);
    for(const r of g.results){if(!ids.has(r.player_id)||seen.has(r.player_id)||!Number.isSafeInteger(r.net_cents))throw new Error('Invalid game result');seen.add(r.player_id);totals.set(r.player_id,totals.get(r.player_id)+r.net_cents);}
    if(!seen.size||g.results.reduce((s,r)=>s+r.net_cents,0)!==0)throw new Error('Game does not balance');
  }
  for(const p of data.players)if(totals.get(p.id)!==p.total_cents)throw new Error('Aggregate counted incorrectly');
  if(!gameIds.has(data.latest_game_id))throw new Error('Missing latest game');
  return data;
}
export const sorted=players=>[...players].sort((a,b)=>b.net-a.net||a.name.localeCompare(b.name));
export function escapeText(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function poster(players,kind,periodLabel,date,fontCss='') {
  const set=groups(players,kind), ranked=sorted(players), ocean=kind==='ocean';
  const title=kind==='school'?'MIT vs Harvard':kind==='year'?'First years vs second years':'The oceans';
  const color=n=>n<0?'#56565c':'#111111';
  const barColor=n=>n<0?'#ababaf':'#c8f53c';
  const txt=(x,y,text,size=22,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escapeText(text)}</text>`;
  const maxGroup=Math.max(1,...set.map(g=>Math.abs(g.net??0))), maxPlayer=Math.max(1,...ranked.map(p=>Math.abs(p.net)));
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><style>${fontCss}</style><rect width="1080" height="1350" fill="#ffffff"/><g fill="#111111" font-family="Jakarta,Arial,sans-serif">`;
  svg+=txt(55,56,'Jake Stein.',22,'font-weight="700" letter-spacing="-1"')+txt(1025,56,'CAMBRIDGE, MA · EST. 2026',13,'text-anchor="end" font-family="monospace" fill="#6b6b6b"');
  svg+=txt(55,114,'CAMBRIDGE HOLD ’EM ASSOCIATION',16,'font-family="monospace" letter-spacing="1" fill="#6b6b6b"');
  svg+=txt(55,180,'Good cards. Better company.',47,'letter-spacing="-2"');
  if(kind!=='school')svg+=txt(55,234,kind==='year'?'MIT CLASS RIVALRY':'MIT STUDENTS',13,'font-family="monospace" letter-spacing="1" fill="#6b6b6b"');
  const subtitle=periodLabel==='Total standings'?periodLabel+' · Through '+date:periodLabel;
  svg+='<rect x="55" y="249" width="'+(kind==='year'?720:kind==='school'?430:300)+'" height="37" fill="#c8f53c"/>';
  svg+=txt(55,283,title,kind==='year'?43:48,'letter-spacing="-2"')+txt(55,314,subtitle,15,'font-family="monospace" fill="#6b6b6b"');
  const groupY=350, groupStep=ocean?42:58, groupBottom=groupY+(set.length-1)*groupStep;
  svg+=`<path d="M565 ${groupY-22}V${groupBottom+10}" stroke="#63636a"/>`;
  set.forEach((g,i)=>{const y=groupY+i*groupStep,width=Math.abs(g.net??0)/maxGroup*280;svg+=txt(56,y,g.name,ocean?22:25,'letter-spacing="-1"')+txt(56,y+17,`${g.count} ${g.count===1?'player':'players'}`,12,'fill="#6b6b6b" font-family="monospace"');if(g.net!==null)svg+=`<rect x="${g.net<0?565-width:565}" y="${y-20}" width="${width}" height="25" fill="${barColor(g.net)}"/>`;svg+=txt(1023,y,money(g.net),25,`font-family="monospace" text-anchor="end" letter-spacing="-1" fill="${color(g.net)}"`);});
  const heading=ocean?644:490,start=heading+50,available=1244-start,step=Math.min(35,available/Math.max(1,ranked.length));
  svg+=`<path d="M55 ${heading-28}H1025" stroke="#e4e4e4"/>`+txt(55,heading,'The leaderboard',25,'letter-spacing="-1"')+txt(1025,heading,'NET ($)',13,'text-anchor="end" font-family="monospace" fill="#6b6b6b"');
  svg+=`<path d="M550 ${start-22}V${start+(ranked.length-1)*step+8}" stroke="#63636a"/>`;
  ranked.forEach((p,i)=>{const y=start+i*step,width=Math.abs(p.net)/maxPlayer*330;svg+=txt(56,y,p.name,23,'letter-spacing="-.7"');svg+=`<rect x="${p.net<0?550-width:550}" y="${y-20}" width="${width}" height="25" fill="${barColor(p.net)}"/>`;svg+=txt(1025,y,money(p.net),23,`font-family="monospace" text-anchor="end" letter-spacing="-1" fill="${color(p.net)}"`);});
  svg+='<path d="M55 1292H1025" stroke="#e4e4e4"/>'+txt(55,1320,'GOOD CARDS. BETTER COMPANY.',13,'font-family="monospace" fill="#6b6b6b"')+txt(1025,1320,'STEINJP.COM/HOLDEM',13,'text-anchor="end" font-family="monospace" fill="#6b6b6b"');
  return svg+'</g></svg>';
}
