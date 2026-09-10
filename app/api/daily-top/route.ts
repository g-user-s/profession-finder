import { getDailyTop } from "@/lib/dailyTop";
import { jsonResponse } from "@/lib/json";
import { getRedisCredentials } from "@/lib/redis";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The same data the homepage server-renders: the cheapest 4 destinations
 * for tomorrow. Served from the daily cron's Redis snapshot, or computed
 * live if that snapshot is missing/stale (see lib/dailyTop.ts).
 *
 * `storage` is here so a misconfigured Redis store is visible rather than
 * silently degrading to a live search on every request forever.
 */
export async function GET() {
  const credentials = getRedisCredentials();
  const { snapshots, date, source, toppedUp, missing } = await getDailyTop();

  return jsonResponse({
    date,
    source,
    storage: {
      configured: credentials !== null,
      envVarStyle: credentials?.source ?? null
    },
    toppedUp,
    missing,
    snapshots
  });
}
