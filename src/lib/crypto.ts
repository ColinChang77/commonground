/**
 * Server-side crypto helpers (WebCrypto — works in Workers and Node 20+).
 * - AES-256-GCM envelope for third-party credentials (agent API keys).
 * - SHA-256 hashing for bearer tokens (MCP tokens are never stored in plaintext).
 * - HMAC-SHA256 + constant-time compare for webhook signatures.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function b64url(bytes: Uint8Array): string {
  return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function importAesKey(base64Key: string) {
  const raw = b64decode(base64Key);
  if (raw.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypts `plaintext`; `aad` binds the ciphertext to its owner (e.g. user id) so rows can't be swapped. */
export async function encryptSecret(plaintext: string, base64Key: string, aad: string): Promise<string> {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(plaintext),
  );
  return `v1.${b64encode(iv)}.${b64encode(new Uint8Array(ct))}`;
}

export async function decryptSecret(payload: string, base64Key: string, aad: string): Promise<string> {
  const [v, ivB64, ctB64] = payload.split(".");
  if (v !== "v1" || !ivB64 || !ctB64) throw new Error("Unsupported ciphertext format");
  const key = await importAesKey(base64Key);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource, additionalData: enc.encode(aad) },
    key,
    b64decode(ctB64) as BufferSource,
  );
  return dec.decode(pt);
}

export async function sha256Hex(input: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function hmacSha256Hex(secretValue: string, body: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secretValue), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const data = typeof body === "string" ? enc.encode(body) : body;
  return hex(await crypto.subtle.sign("HMAC", key, data as BufferSource));
}

export function maskSecret(s: string) {
  const t = s.trim();
  return t.length <= 8 ? "••••" : `${t.slice(0, 3)}…${t.slice(-4)}`;
}
