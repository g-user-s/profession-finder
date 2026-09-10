import {
  claimTopUpSlot,
  getAllLatestSnapshotsSafely,
  recordDailySnapshotSafely,
  type DailyDestinationSnapshot
} from "./dailySnapshot";
import { resolveDateRange } from "./dates";
import { destinations } from "./destinations";
import { searchCheapestFlights } from "./search";

export const DAILY_TOP_LIMIT = 4;

/** How long to wait before retrying destinations that came back empty. */
const TOP_UP_COOLDOWN_SECONDS = 15 * 60;

export type DailyTop = {
  snapshots: DailyDestinationSnapshot[];
  date: string;
  /** "stored" = the cron's data; "live" = computed on this request. */
  source: "stored" | "live";
  /** Destinations retried on this request because they were missing. */
  toppedUp: string[];
  /**
   * Destinations that produced no price. Surfaced (rather than silently
   * dropped) because a short list is the symptom you notice, and the
   * reason — throttling, a parse failure — is what you actually need.
   */
  missing: Array<{ city: string; error: string | null }>;
};

function cheapestFirst(snapshots: DailyDestinationSnapshot[]): DailyDestinationSnapshot[] {
  return [...snapshots].sort((a, b) => a.cheapest.price - b.cheapest.price);
}

/**
 * Searches the given cities live and persists whatever comes back.
 * Returns the snapshots plus the ones that still produced nothing.
 */
async function searchAndRecord(
  cities: string[] | "all",
  date: string
): Promise<{
  snapshots: DailyDestinationSnapshot[];
  missing: Array<{ city: string; error: string | null }>;
}> {
  const outcomes = await searchCheapestFlights({ city: cities, dateOption: "tomorrow" });
  const snapshots: DailyDestinationSnapshot[] = [];
  const missing: Array<{ city: string; error: string | null }> = [];

  for (const outcome of outcomes) {
    if (!outcome.cheapest) {
      missing.push({ city: outcome.city, error: outcome.error });
      continue;
    }
    snapshots.push(
      await recordDailySnapshotSafely(outcome.city, outcome.country, date, outcome.cheapest)
    );
  }

  return { snapshots, missing };
}

/**
 * The homepage's "Yarın için en ucuz fırsatlar" data.
 *
 * Normally this is just a Redis read of what the 09:00 cron stored. It
 * falls back to searching live when the stored data can't be used:
 *
 * - nothing stored yet (fresh deploy, before the first cron run)
 * - stored data for a day that is no longer tomorrow (a failed or
 *   never-configured cron — showing a stale date under a "Yarın" heading
 *   would be wrong, not just old)
 * - stored data missing some destinations (a throttled cron run). Those
 *   get retried and merged in, so a partial failure heals within minutes
 *   instead of standing until the next morning's run.
 *
 * Every live path persists what it finds, so the next visitor gets the
 * fast path.
 */
export async function getDailyTop(limit = DAILY_TOP_LIMIT): Promise<DailyTop> {
  const { fromDate: tomorrow } = resolveDateRange("tomorrow");
  const cities = destinations.map((destination) => destination.city);

  const stored = (await getAllLatestSnapshotsSafely(cities)).filter(
    (snapshot) => snapshot.date === tomorrow
  );

  if (stored.length === 0) {
    const { snapshots, missing } = await searchAndRecord("all", tomorrow);
    return {
      snapshots: cheapestFirst(snapshots).slice(0, limit),
      date: tomorrow,
      source: "live",
      toppedUp: [],
      missing
    };
  }

  const storedCities = new Set(stored.map((snapshot) => snapshot.city));
  const missingCities = cities.filter((city) => !storedCities.has(city));

  // Rate-limited on purpose: retrying on every request while a destination
  // stays unavailable is what causes the throttling to begin with.
  if (missingCities.length === 0 || !(await claimTopUpSlot(tomorrow, TOP_UP_COOLDOWN_SECONDS))) {
    return {
      snapshots: cheapestFirst(stored).slice(0, limit),
      date: tomorrow,
      source: "stored",
      toppedUp: [],
      missing: missingCities.map((city) => ({ city, error: null }))
    };
  }

  const { snapshots: recovered, missing } = await searchAndRecord(missingCities, tomorrow);

  return {
    snapshots: cheapestFirst([...stored, ...recovered]).slice(0, limit),
    date: tomorrow,
    source: "stored",
    toppedUp: recovered.map((snapshot) => snapshot.city),
    missing
  };
}
