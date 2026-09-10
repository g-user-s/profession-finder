import {
  claimTopUpSlot,
  getAllLatestSnapshotsSafely,
  recordDailySnapshotSafely,
  type DailyDestinationSnapshot
} from "./dailySnapshot";
import { getIstanbulToday } from "./dates";
import { destinations } from "./destinations";
import { searchCheapestFlights } from "./search";

export const DAILY_TOP_LIMIT = 4;

/** How long to wait before retrying destinations that came back empty. */
const TOP_UP_COOLDOWN_SECONDS = 15 * 60;

/**
 * How old stored prices may be before we re-search. Comfortably longer
 * than a day so the hours between midnight and the 09:00 cron don't make
 * every early visitor pay for a full live search, but short enough that
 * nothing older than one missed run is ever shown.
 */
const MAX_SNAPSHOT_AGE_MS = 30 * 60 * 60 * 1000;

export type DailyTop = {
  snapshots: DailyDestinationSnapshot[];
  /** Istanbul day the served prices were observed on. */
  observedOn: string;
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
 * A stored snapshot is usable while it's recent enough AND its flight
 * hasn't already departed. The second check matters on its own: a fare
 * found late yesterday for "today" is only hours old but points at a date
 * that may now be in the past.
 *
 * Snapshots without `observedOn` predate the switch from a single-day to
 * a whole-month search. They read as fresh but were found under different
 * rules, so they're discarded and re-searched rather than shown under a
 * heading that promises something else. (Redis hands back plain JSON, so
 * the field really can be absent whatever the type says.)
 */
function isUsable(snapshot: DailyDestinationSnapshot, today: string, now: number): boolean {
  if (!(snapshot as Partial<DailyDestinationSnapshot>).observedOn) return false;
  const age = now - new Date(snapshot.capturedAt).getTime();
  if (!Number.isFinite(age) || age > MAX_SNAPSHOT_AGE_MS) return false;
  return snapshot.cheapest.departureDate >= today;
}

/**
 * Searches the given cities live and persists whatever comes back.
 * Returns the snapshots plus the ones that still produced nothing.
 */
async function searchAndRecord(
  cities: string[] | "all",
  observedOn: string
): Promise<{
  snapshots: DailyDestinationSnapshot[];
  missing: Array<{ city: string; error: string | null }>;
}> {
  const outcomes = await searchCheapestFlights({ city: cities, dateOption: "this_month" });
  const snapshots: DailyDestinationSnapshot[] = [];
  const missing: Array<{ city: string; error: string | null }> = [];

  for (const outcome of outcomes) {
    if (!outcome.cheapest) {
      missing.push({ city: outcome.city, error: outcome.error });
      continue;
    }
    snapshots.push(
      await recordDailySnapshotSafely(outcome.city, outcome.country, observedOn, outcome.cheapest)
    );
  }

  return { snapshots, missing };
}

/**
 * The homepage's "Bu ay en ucuz fırsatlar" data: the cheapest fare to each
 * destination anywhere in the remaining month, cheapest cities first.
 *
 * Normally this is just a Redis read of what the 09:00 cron stored. It
 * falls back to searching live when the stored data can't be used:
 *
 * - nothing stored yet (fresh deploy, before the first cron run)
 * - stored data too old, or pointing at a date that has already passed
 *   (a failed or never-configured cron)
 * - stored data missing some destinations (a throttled cron run). Those
 *   get retried and merged in, so a partial failure heals within minutes
 *   instead of standing until the next morning's run.
 *
 * Every live path persists what it finds, so the next visitor gets the
 * fast path.
 */
export async function getDailyTop(limit = DAILY_TOP_LIMIT): Promise<DailyTop> {
  const today = getIstanbulToday();
  const now = Date.now();
  const cities = destinations.map((destination) => destination.city);

  const stored = (await getAllLatestSnapshotsSafely(cities)).filter((snapshot) =>
    isUsable(snapshot, today, now)
  );

  if (stored.length === 0) {
    const { snapshots, missing } = await searchAndRecord("all", today);
    return {
      snapshots: cheapestFirst(snapshots).slice(0, limit),
      observedOn: today,
      source: "live",
      toppedUp: [],
      missing
    };
  }

  const storedCities = new Set(stored.map((snapshot) => snapshot.city));
  const missingCities = cities.filter((city) => !storedCities.has(city));

  // Rate-limited on purpose: retrying on every request while a destination
  // stays unavailable is what causes the throttling to begin with.
  if (missingCities.length === 0 || !(await claimTopUpSlot(today, TOP_UP_COOLDOWN_SECONDS))) {
    return {
      snapshots: cheapestFirst(stored).slice(0, limit),
      observedOn: today,
      source: "stored",
      toppedUp: [],
      missing: missingCities.map((city) => ({ city, error: null }))
    };
  }

  const { snapshots: recovered, missing } = await searchAndRecord(missingCities, today);

  return {
    snapshots: cheapestFirst([...stored, ...recovered]).slice(0, limit),
    observedOn: today,
    source: "stored",
    toppedUp: recovered.map((snapshot) => snapshot.city),
    missing
  };
}
