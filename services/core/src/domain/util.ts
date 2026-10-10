import type { ErrorCode } from './types';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function randomId(prefix: string, length = 20): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${s}`;
}
export function randomToken(bytes = 32): string { const b = new Uint8Array(bytes); crypto.getRandomValues(b); return b64url(b); }
export function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function hmacKey(secret: string, usage: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('campsite'), info: new TextEncoder().encode(usage) }, material, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
}
export async function hmacSign(secret: string, usage: string, data: string): Promise<string> {
  const key = await hmacKey(secret, usage);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))));
}
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export class ApiError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number, message?: string) { super(message ?? code); }
}
export const notFound = () => new ApiError('NOT_FOUND', 404);
export const invalid = (msg?: string) => new ApiError('INVALID_REQUEST', 400, msg);
export const iso = (d: Date) => d.toISOString();
export const utcDate = (d: Date) => d.toISOString().slice(0, 10);
export function parseCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const idx = cursor.lastIndexOf('|');
  if (idx <= 0) throw invalid('bad cursor');
  return { createdAt: cursor.slice(0, idx), id: cursor.slice(idx + 1) };
}
export const makeCursor = (createdAt: string, id: string) => `${createdAt}|${id}`;
