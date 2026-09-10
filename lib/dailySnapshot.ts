import { compareToHistory, MAX_HISTORY_SAMPLES } from "./pricing";
import { getRedis } from "./redis";
import type { FlightResult } from "./types";

class RedisNotConfiguredError extends Error {
  constructor() {
    super(
      "Redis yapılandırılmamış. Vercel dashboard → Storage → Upstash for Redis entegrasyonunu bu projeye ekleyin (bkz. README)."
    );
    this.name = "RedisNotConfiguredError";
  }
}

function requireRedis() {
  const redis = getRedis();
  if (!redis) throw new RedisNotConfiguredError();
  return redis;
}

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
  const redis = requireRedis();
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
  const redis = getRedis();
  if (!redis) return null;
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
 * so an unconfigured store or a transient Redis outage degrades to a live
 * search (see lib/dailyTop.ts) instead of a 500.
 */
export async function getAllLatestSnapshotsSafely(
  cities: string[]
): Promise<DailyDestinationSnapshot[]> {
  try {
    return await getAllLatestSnapshots(cities);
  } catch (error) {
    console.error("Failed to read daily snapshots from Redis:", error);
    return [];
  }
}
