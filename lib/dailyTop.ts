import {
  getAllLatestSnapshotsSafely,
  recordDailySnapshotSafely,
  type DailyDestinationSnapshot
} from "./dailySnapshot";
import { resolveDateRange } from "./dates";
import { destinations } from "./destinations";
import { searchCheapestFlights } from "./search";

export const DAILY_TOP_LIMIT = 4;

export type DailyTop = {
  snapshots: DailyDestinationSnapshot[];
  date: string;
  /** "stored" = the cron's data; "live" = computed on this request. */
  source: "stored" | "live";
};

function cheapestFirst(snapshots: DailyDestinationSnapshot[]): DailyDestinationSnapshot[] {
  return [...snapshots].sort((a, b) => a.cheapest.price - b.cheapest.price);
}

/**
 * The homepage's "Yarın için en ucuz fırsatlar" data.
 *
 * Normally this is just a Redis read of what the 09:00 cron stored. Two
 * cases fall back to a live search instead: nothing stored yet (fresh
 * deploy, before the first cron run) and stored data for a day that is no
 * longer tomorrow (a cron run that failed or was never set up — showing a
 * stale date under a "Yarın" heading would be wrong, not just old).
 *
 * The live path persists what it finds, so it costs one slow request and
 * every visitor after that gets the fast path.
 */
export async function getDailyTop(limit = DAILY_TOP_LIMIT): Promise<DailyTop> {
  const { fromDate: tomorrow } = resolveDateRange("tomorrow");
  const cities = destinations.map((destination) => destination.city);

  const stored = (await getAllLatestSnapshotsSafely(cities)).filter(
    (snapshot) => snapshot.date === tomorrow
  );
  if (stored.length > 0) {
    return { snapshots: cheapestFirst(stored).slice(0, limit), date: tomorrow, source: "stored" };
  }

  const outcomes = await searchCheapestFlights({ city: "all", dateOption: "tomorrow" });
  const live: DailyDestinationSnapshot[] = [];
  for (const outcome of outcomes) {
    if (!outcome.cheapest) continue;
    live.push(
      await recordDailySnapshotSafely(outcome.city, outcome.country, tomorrow, outcome.cheapest)
    );
  }

  return { snapshots: cheapestFirst(live).slice(0, limit), date: tomorrow, source: "live" };
}
