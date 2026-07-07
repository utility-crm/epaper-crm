const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64urlDecode(str: string): ArrayBuffer {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// HS256 verify (mirrors content/admin workers). Returns payload or null.
export async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const isValid = await crypto.subtle.verify('HMAC', key, base64urlDecode(signatureB64), encoder.encode(data));
  if (!isValid) return null;

  try {
    const payload = JSON.parse(decoder.decode(base64urlDecode(payloadB64))) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
