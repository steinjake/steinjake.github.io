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
  const specs=kind==='school'?[['MIT',p=>p.school==='MIT'],['Harvard',p=>p.school==='Harvard']]:kind==='year'?[['First years',p=>p.year===1],['Second years',p=>p.year===2]]:oceans.map(o=>[o,p=>p.school==='MIT'&&p.ocean===o]);
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
// The public file deliberately carries only grouped money totals.
export function validatePublic(data) {
  const exactKeys=(value,keys)=>Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));
  if(!data||data.schema_version!==3||!exactKeys(data,['schema_version','updated','latest_game_date','totals','note'])||!exactKeys(data.totals,['school','year','ocean']))throw new Error('Public standings unavailable');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.updated)||!/^\d{4}-\d{2}-\d{2}$/.test(data.latest_game_date)||typeof data.note!=='string')throw new Error('Invalid standings metadata');
  const names={school:['MIT','Harvard'],year:['First years','Second years'],ocean:oceans},totals=data.totals;
    for(const kind of ['school','year','ocean']){
      if(!Array.isArray(totals[kind])||totals[kind].length!==names[kind].length)throw new Error('Missing comparison');
      totals[kind].forEach((g,i)=>{if(!exactKeys(g,['name','net'])||g.name!==names[kind][i]||!(g.net===null||Number.isSafeInteger(g.net)))throw new Error('Invalid public group');});
    }
    const sum=kind=>totals[kind].reduce((s,g)=>s+(g.net??0),0),mit=totals.school[0].net??0;
    if(sum('school')!==0||sum('year')!==0||sum('ocean')!==mit)throw new Error('Comparisons do not reconcile');
  return data;
}
export async function decryptMembers(envelope,password,subtle=globalThis.crypto.subtle) {
  if(envelope.version!==1||envelope.scheme!=='PBKDF2-SHA256+A256GCM'||envelope.iterations!==310000)throw new Error('Invalid encrypted ledger');
  const bytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0)),salt=bytes(envelope.salt),iv=bytes(envelope.iv);
  if(salt.length!==16||iv.length!==12)throw new Error('Invalid encrypted ledger');
  const material=await subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  const key=await subtle.deriveKey({name:'PBKDF2',salt,iterations:envelope.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const plaintext=await subtle.decrypt({name:'AES-GCM',iv,tagLength:128},key,bytes(envelope.ciphertext));
  return validate(JSON.parse(new TextDecoder().decode(plaintext)));
}
export const sorted=players=>[...players].sort((a,b)=>b.net-a.net||a.name.localeCompare(b.name));
export function escapeText(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function poster(players,kind,label,date,fontCss='') {
  const ranked=sorted(players),set=groups(players,kind),max=Math.max(1,...ranked.map(p=>Math.abs(p.net))),maxGroup=Math.max(1,...set.map(g=>Math.abs(g.net??0)));
  const text=(x,y,value,size=24,attrs='')=>`<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${escapeText(value)}</text>`;
  const color=n=>n<0?'#9c6659':'#45616b';
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><style>${fontCss}</style><rect width="1080" height="1350" fill="#f6f2e9"/><g fill="#25333b" font-family="ClubSans,Arial,sans-serif">`;
  svg+=text(55,60,'Cambridge Hold ’Em Association',42,'font-family="ClubSerif,Georgia,serif"')+text(55,104,'Player standings · Through '+date,20,'fill="#726c63"');
  svg+=text(55,162,kind==='year'?'First-year vs second-year MBAs':kind==='ocean'?'The oceans · MIT only':'MIT vs Harvard',30,'font-family="ClubSerif,Georgia,serif"');
  const stepGroup=kind==='ocean'?34:48;
  set.forEach((g,i)=>{const y=208+i*stepGroup,w=Math.abs(g.net??0)/maxGroup*220;svg+=text(55,y,g.name,22)+`<rect x="${g.net<0?620-w:620}" y="${y-22}" width="${w}" height="27" fill="${color(g.net)}"/>`+text(1025,y,money(g.net),24,`text-anchor="end" fill="${color(g.net)}"`);});
  const heading=kind==='ocean'?445:330,start=heading+53,step=Math.min(43,(1238-start)/Math.max(1,ranked.length));
  svg+=`<path d="M55 ${heading-27}H1025" stroke="#d8d0c4"/>`+text(55,heading,'The leaderboard',29,'font-family="ClubSerif,Georgia,serif"');
  svg+=`<path d="M600 ${start-25}V${start+(ranked.length-1)*step+10}" stroke="#726c63"/>`;
  ranked.forEach((p,i)=>{const y=start+i*step,w=Math.abs(p.net)/max*285;svg+=text(55,y,p.name,25)+`<rect x="${p.net<0?600-w:600}" y="${y-23}" width="${w}" height="28" fill="${color(p.net)}"/>`+text(1025,y,money(p.net),26,`text-anchor="end" fill="${color(p.net)}"`);});
  svg+='<path d="M55 1290H1025" stroke="#d8d0c4"/>'+text(55,1321,'Net winnings / losses · USD',17,'fill="#726c63"')+text(1025,1321,'STEINJP.COM/HOLDEM',17,'text-anchor="end" fill="#726c63"');
  return svg+'</g></svg>';
}
