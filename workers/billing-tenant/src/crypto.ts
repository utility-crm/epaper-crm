const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const keyData = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt']);
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const ctHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${ivHex}:${ctHex}`;
}

export async function decrypt(encrypted: string, keyHex: string): Promise<string> {
  const keyData = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
  
  const [ivHex, ctHex] = encrypted.split(':');
  if (!ivHex || !ctHex) throw new Error('Invalid encrypted format');
  
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const ct = new Uint8Array(ctHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct
  );
  
  return decoder.decode(plaintext);
}
