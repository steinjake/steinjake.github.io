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
// The public file deliberately carries only grouped money totals.
export function validatePublic(data) {
  const exactKeys=(value,keys)=>Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));
  if(!data||data.schema_version!==2||!exactKeys(data,['schema_version','updated','latest_game_date','periods','note'])||!Array.isArray(data.periods)||!data.periods.length)throw new Error('Public standings unavailable');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.updated)||!/^\d{4}-\d{2}-\d{2}$/.test(data.latest_game_date)||typeof data.note!=='string')throw new Error('Invalid standings metadata');
  const ids=new Set(),names={school:['MIT','Harvard'],year:['First years','Second years'],ocean:oceans};
  for(const period of data.periods){
    if(!exactKeys(period,['id','label','school','year','ocean'])||typeof period.id!=='string'||ids.has(period.id)||typeof period.label!=='string')throw new Error('Invalid standings period');
    ids.add(period.id);
    for(const kind of ['school','year','ocean']){
      if(!Array.isArray(period[kind])||period[kind].length!==names[kind].length)throw new Error('Missing comparison');
      period[kind].forEach((g,i)=>{if(!exactKeys(g,['name','net'])||g.name!==names[kind][i]||!(g.net===null||Number.isSafeInteger(g.net)))throw new Error('Invalid public group');});
    }
    const sum=kind=>period[kind].reduce((s,g)=>s+(g.net??0),0),mit=period.school[0].net??0;
    if(sum('school')!==0||sum('year')!==mit||sum('ocean')!==mit)throw new Error('Comparisons do not reconcile');
  }
  if(!ids.has('all')||!ids.has('opening'))throw new Error('Missing standings period');
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
  set.forEach((g,i)=>{const y=groupY+i*groupStep,width=Math.abs(g.net??0)/maxGroup*280;svg+=txt(56,y,g.name,ocean?22:25,'letter-spacing="-1"');if(g.net!==null)svg+=`<rect x="${g.net<0?565-width:565}" y="${y-20}" width="${width}" height="25" fill="${barColor(g.net)}"/>`;svg+=txt(1023,y,money(g.net),25,`font-family="monospace" text-anchor="end" letter-spacing="-1" fill="${color(g.net)}"`);});
  const heading=ocean?644:490,start=heading+50,available=1244-start,step=Math.min(35,available/Math.max(1,ranked.length));
  svg+=`<path d="M55 ${heading-28}H1025" stroke="#e4e4e4"/>`+txt(55,heading,'The leaderboard',25,'letter-spacing="-1"')+txt(1025,heading,'NET ($)',13,'text-anchor="end" font-family="monospace" fill="#6b6b6b"');
  svg+=`<path d="M550 ${start-22}V${start+(ranked.length-1)*step+8}" stroke="#63636a"/>`;
  ranked.forEach((p,i)=>{const y=start+i*step,width=Math.abs(p.net)/maxPlayer*330;svg+=txt(56,y,p.name,23,'letter-spacing="-.7"');svg+=`<rect x="${p.net<0?550-width:550}" y="${y-20}" width="${width}" height="25" fill="${barColor(p.net)}"/>`;svg+=txt(1025,y,money(p.net),23,`font-family="monospace" text-anchor="end" letter-spacing="-1" fill="${color(p.net)}"`);});
  svg+='<path d="M55 1292H1025" stroke="#e4e4e4"/>'+txt(55,1320,'GOOD CARDS. BETTER COMPANY.',13,'font-family="monospace" fill="#6b6b6b"')+txt(1025,1320,'STEINJP.COM/HOLDEM',13,'text-anchor="end" font-family="monospace" fill="#6b6b6b"');
  return svg+'</g></svg>';
}
export function breakdownPoster(period,label,date,fontCss='') {
  const txt=(x,y,text,size=24,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escapeText(text)}</text>`;
  const muted='fill="#6b6b6b" font-family="monospace"',line=y=>`<path d="M55 ${y}H1025" stroke="#e4e4e4"/>`;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><style>${fontCss}</style><rect width="1080" height="1350" fill="#ffffff"/><g fill="#111111" font-family="Jakarta,Arial,sans-serif">`;
  svg+=txt(55,55,'Jake Stein.',22,'font-weight="700" letter-spacing="-1"')+txt(1025,55,'CAMBRIDGE, MA · EST. 2026',14,`text-anchor="end" ${muted}`);
  svg+='<rect x="55" y="94" width="95" height="118" fill="#c8f53c"/>'+txt(102,178,'♣',74,'text-anchor="middle"');
  svg+=txt(178,145,'Cambridge Hold ’Em',62,'letter-spacing="-3"')+txt(178,210,'Association',62,'letter-spacing="-3"');
  svg+=txt(55,261,'Good cards. Better company.',25,'letter-spacing="-1"');
  svg+=txt(55,307,label==='Total standings'?`${label} · Through ${date}`:label,19,muted)+line(330);
  const pair=(values,title,y,scope)=>{
    let out=txt(55,y,title,title.length>25?38:46,'letter-spacing="-2"');
    if(scope)out+=txt(1025,y,'MIT ONLY',17,`text-anchor="end" ${muted}`);
    values.forEach((g,i)=>{const x=i?575:55;out+=txt(x,y+55,g.name,25,'letter-spacing="-1"')+txt(x,y+125,money(g.net),61,`font-family="monospace" letter-spacing="-4" fill="${g.net<0?'#56565c':'#111111'}"`);out+=`<rect x="${x}" y="${y+143}" width="450" height="9" fill="${g.net===null?'#e4e4e4':g.net<0?'#ababaf':'#c8f53c'}"/>`;});
    return out;
  };
  svg+=pair(period.school,'MIT vs Harvard',387,false)+line(572);
  svg+=pair(period.year,'First-year vs second-year MBAs',626,true)+line(811);
  svg+=txt(55,866,'The oceans',46,'letter-spacing="-2"')+txt(1025,866,'MIT ONLY',17,`text-anchor="end" ${muted}`);
  const max=Math.max(1,...period.ocean.map(g=>Math.abs(g.net??0))),origin=635,start=928,step=47;
  svg+=`<path d="M${origin} ${start-25}V${start+5*step+10}" stroke="#63636a"/>`;
  period.ocean.forEach((g,i)=>{const y=start+i*step,width=Math.abs(g.net??0)/max*245;svg+=txt(55,y,g.name,25,'letter-spacing="-1"');svg+=`<rect x="${g.net<0?origin-width:origin}" y="${y-24}" width="${width}" height="31" fill="${g.net<0?'#ababaf':'#c8f53c'}"/>`;svg+=txt(1025,y,money(g.net),27,`text-anchor="end" font-family="monospace" fill="${g.net<0?'#56565c':'#111111'}"`);});
  svg+=line(1203)+txt(55,1238,'NET WINNINGS / LOSSES · USD',17,muted)+txt(55,1270,'MIT class years and oceans each sum to its school total.',19,muted);
  svg+=txt(55,1320,'GOOD CARDS. BETTER COMPANY.',14,muted)+txt(1025,1320,'STEINJP.COM/HOLDEM',14,`text-anchor="end" ${muted}`);
  return svg+'</g></svg>';
}
