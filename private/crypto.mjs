export const scheme='PBKDF2-SHA256+A256GCM';
export const iterations=600000;
export const additionalData=new TextEncoder().encode('steinjp-private:v1');

export async function decryptBundle(envelope,password,subtle=globalThis.crypto.subtle){
  if(envelope.version!==1||envelope.scheme!==scheme||envelope.iterations!==iterations)throw new Error('Unsupported bundle');
  const bytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  const salt=bytes(envelope.salt),iv=bytes(envelope.iv),ciphertext=bytes(envelope.ciphertext);
  if(salt.length!==16||iv.length!==12||ciphertext.length<16||ciphertext.length>8000000)throw new Error('Invalid bundle');
  const material=await subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  const key=await subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const plaintext=await subtle.decrypt({name:'AES-GCM',iv,additionalData,tagLength:128},key,ciphertext);
  const bundle=JSON.parse(new TextDecoder().decode(plaintext));
  if(bundle.version!==1||!Array.isArray(bundle.pages)||!bundle.pages.length)throw new Error('Invalid pages');
  const ids=new Set();
  for(const page of bundle.pages){
    if(!/^[a-z0-9-]+$/.test(page.id)||ids.has(page.id)||!Array.isArray(page.tags)||![page.title,page.description,page.html,...page.tags].every(x=>typeof x==='string'))throw new Error('Invalid page');
    if(!page.files||typeof page.files!=='object'||Object.entries(page.files).some(([name,file])=>!/^[a-z0-9.-]+$/.test(name)||typeof file.text!=='string'||typeof file.type!=='string'))throw new Error('Invalid downloads');
    ids.add(page.id);
  }
  return bundle;
}
