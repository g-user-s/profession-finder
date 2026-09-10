import { Redis } from "@upstash/redis";
import { compareToHistory, MAX_HISTORY_SAMPLES } from "./pricing";
import type { FlightResult } from "./types";

/**
 * Redis.fromEnv() reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN,
 * which the "Upstash for Redis" integration (Vercel Marketplace → Storage)
 * injects automatically once added to this project. See README "Deploy".
 */
const redis = Redis.fromEnv();

export type DailyDestinationSnapshot = {
  city: string;
  country: string;
  date: string;
  cheapest: FlightResult;
  baseline: number | null;
  discountPercent: number | null;
  capturedAt: string;
};

function historyKey(city: string): string {
  return `daily:history:${city}`;
}

function latestKey(city: string): string {
  return `daily:latest:${city}`;
}

/**
 * Records today's cheapest "tomorrow" price for a destination and returns
 * it compared against its own history (see lib/pricing.ts). Stored as a
 * Redis hash keyed by date so a retried/duplicate cron run for the same
 * day overwrites in place instead of skewing the sample — and so pruning
 * down to the last MAX_HISTORY_SAMPLES days is a plain sort, no separate
 * trim bookkeeping.
 */
export async function recordDailySnapshot(
  city: string,
  country: string,
  date: string,
  cheapest: FlightResult
): Promise<DailyDestinationSnapshot> {
  await redis.hset(historyKey(city), { [date]: cheapest.price });

  const allEntries = (await redis.hgetall<Record<string, number>>(historyKey(city))) ?? {};
  const datesNewestFirst = Object.keys(allEntries).sort().reverse();

  const datesToPrune = datesNewestFirst.slice(MAX_HISTORY_SAMPLES);
  if (datesToPrune.length > 0) {
    await redis.hdel(historyKey(city), ...datesToPrune);
  }

  const priorPrices = datesNewestFirst
    .slice(0, MAX_HISTORY_SAMPLES)
    .filter((entryDate) => entryDate !== date)
    .map((entryDate) => allEntries[entryDate]!);

  const { baseline, discountPercent } = compareToHistory(cheapest.price, priorPrices);

  const snapshot: DailyDestinationSnapshot = {
    city,
    country,
    date,
    cheapest,
    baseline,
    discountPercent,
    capturedAt: new Date().toISOString()
  };

  await redis.set(latestKey(city), snapshot);
  return snapshot;
}

/**
 * Same as recordDailySnapshot, but a Redis failure (not configured yet, or
 * a transient outage) degrades to an unpersisted snapshot instead of
 * throwing — the caller still gets a usable price to show, just without a
 * history-backed baseline.
 */
export async function recordDailySnapshotSafely(
  city: string,
  country: string,
  date: string,
  cheapest: FlightResult
): Promise<DailyDestinationSnapshot> {
  try {
    return await recordDailySnapshot(city, country, date, cheapest);
  } catch (error) {
    console.error(`Failed to persist daily snapshot for ${city}:`, error);
    return {
      city,
      country,
      date,
      cheapest,
      baseline: null,
      discountPercent: null,
      capturedAt: new Date().toISOString()
    };
  }
}

export async function getLatestSnapshot(city: string): Promise<DailyDestinationSnapshot | null> {
  const value = await redis.get<DailyDestinationSnapshot>(latestKey(city));
  return value ?? null;
}

export async function getAllLatestSnapshots(
  cities: string[]
): Promise<DailyDestinationSnapshot[]> {
  const snapshots = await Promise.all(cities.map((city) => getLatestSnapshot(city)));
  return snapshots.filter(
    (snapshot): snapshot is DailyDestinationSnapshot => snapshot !== null
  );
}

/**
 * Same as getAllLatestSnapshots, but never throws — used on the homepage
 * so a not-yet-configured KV store (before the first deploy's setup step)
 * or a transient KV outage degrades to "no deals yet" instead of a 500.
 */
export async function getAllLatestSnapshotsSafely(
  cities: string[]
): Promise<DailyDestinationSnapshot[]> {
  try {
    return await getAllLatestSnapshots(cities);
  } catch (error) {
    console.error("Failed to read daily snapshots from KV:", error);
    return [];
  }
}
