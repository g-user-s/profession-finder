/**
 * Simplest cache that could work: an in-memory Map in the serverless
 * function's module scope.
 *
 * On Vercel this is NOT durable or shared — each cold start gets an empty
 * Map, and concurrent/scaled-out instances each hold their own copy. It
 * only helps with repeat requests hitting an already-warm instance. That's
 * an accepted MVP tradeoff (see README); if a real shared cache is needed
 * later, swap this module's two functions for a Redis/Vercel KV client —
 * nothing outside this file needs to change.
 */
type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 1000 * 60 * 10;

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
