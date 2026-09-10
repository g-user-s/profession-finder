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
  /** The Istanbul calendar day this price was observed on. */
  observedOn: string;
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
 * Records the cheapest fare found for a destination today and returns it
 * compared against its own history (see lib/pricing.ts).
 *
 * History is keyed by the day we *observed* the price, not the day the
 * flight departs. The search covers a whole month, so the winning
 * departure date moves around; keying by it would scatter samples across
 * dozens of future dates and leave the median comparing unrelated things.
 * Keyed by observation day, each entry answers the question the badge
 * actually asks: what did the cheapest fare to this city cost on day X?
 *
 * A hash (rather than a list) means a retried or duplicate cron run for
 * the same day overwrites in place instead of skewing the sample, and
 * pruning to the last MAX_HISTORY_SAMPLES days is a plain sort.
 */
export async function recordDailySnapshot(
  city: string,
  country: string,
  observedOn: string,
  cheapest: FlightResult
): Promise<DailyDestinationSnapshot> {
  const redis = requireRedis();
  await redis.hset(historyKey(city), { [observedOn]: cheapest.price });

  const allEntries = (await redis.hgetall<Record<string, number>>(historyKey(city))) ?? {};
  const daysNewestFirst = Object.keys(allEntries).sort().reverse();

  const daysToPrune = daysNewestFirst.slice(MAX_HISTORY_SAMPLES);
  if (daysToPrune.length > 0) {
    await redis.hdel(historyKey(city), ...daysToPrune);
  }

  const priorPrices = daysNewestFirst
    .slice(0, MAX_HISTORY_SAMPLES)
    .filter((day) => day !== observedOn)
    .map((day) => allEntries[day]!);

  const { baseline, discountPercent } = compareToHistory(cheapest.price, priorPrices);

  const snapshot: DailyDestinationSnapshot = {
    city,
    country,
    observedOn,
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
  observedOn: string,
  cheapest: FlightResult
): Promise<DailyDestinationSnapshot> {
  try {
    return await recordDailySnapshot(city, country, observedOn, cheapest);
  } catch (error) {
    console.error(`Failed to persist daily snapshot for ${city}:`, error);
    return {
      city,
      country,
      observedOn,
      cheapest,
      baseline: null,
      discountPercent: null,
      capturedAt: new Date().toISOString()
    };
  }
}

/**
 * Claims the right to retry the destinations missing from today's
 * snapshot, at most once per cooldown window.
 *
 * Without this, every visitor would trigger a fresh live search for as
 * long as a destination stays unavailable — slow for them, and the exact
 * burst of Google requests that causes the throttling in the first place.
 * SET NX makes the claim atomic, so a burst of simultaneous requests
 * produces one retry rather than a stampede.
 *
 * Returns true when no store is configured: there's nothing to
 * coordinate, and that setup already searches live on every request.
 */
export async function claimTopUpSlot(date: string, cooldownSeconds: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;

  try {
    const claimed = await redis.set(`daily:topup:${date}`, Date.now(), {
      nx: true,
      ex: cooldownSeconds
    });
    return claimed === "OK";
  } catch (error) {
    console.error("Failed to claim top-up slot:", error);
    return false;
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
