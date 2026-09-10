import { Redis } from "@upstash/redis";

export type RedisCredentialSource = "upstash" | "kv";

/**
 * Vercel injects Upstash REST credentials under two different naming
 * conventions depending on how the store was attached: the Marketplace
 * "Upstash for Redis" integration keeps the KV_* names inherited from the
 * old Vercel KV product, while a direct Upstash connection uses UPSTASH_*.
 *
 * Reading both matters because the failure mode of guessing wrong is
 * silent: every request would quietly fall back to a live search, nothing
 * would ever persist, and the price history behind the discount badge
 * would never accumulate.
 */
export function getRedisCredentials(): {
  url: string;
  token: string;
  source: RedisCredentialSource;
} | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      source: "upstash"
    };
  }

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
      source: "kv"
    };
  }

  return null;
}

let client: Redis | null = null;

/** Returns null (rather than throwing) when no store is configured. */
export function getRedis(): Redis | null {
  if (client) return client;

  const credentials = getRedisCredentials();
  if (!credentials) return null;

  client = new Redis({ url: credentials.url, token: credentials.token });
  return client;
}
