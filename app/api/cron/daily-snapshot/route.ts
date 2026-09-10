import { resolveDateRange } from "@/lib/dates";
import { recordDailySnapshot } from "@/lib/dailySnapshot";
import { jsonResponse } from "@/lib/json";
import { getRedisCredentials } from "@/lib/redis";
import { searchCheapestFlights } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fired daily by Vercel Cron (see vercel.json, 06:00 UTC = 09:00
 * Europe/Istanbul). Reuses the same search orchestrator the manual search
 * form uses — this is just "Yarın + Tüm destinasyonlar", run on a
 * schedule and persisted instead of returned to a browser.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!getRedisCredentials()) {
    return jsonResponse(
      {
        error:
          "Redis yapılandırılmamış. Vercel dashboard → Storage → Upstash for Redis entegrasyonunu bu projeye ekleyin (bkz. README).",
        expectedEnvVars: [
          "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN",
          "veya KV_REST_API_URL + KV_REST_API_TOKEN"
        ]
      },
      503
    );
  }

  const { fromDate } = resolveDateRange("tomorrow");
  const outcomes = await searchCheapestFlights({ city: "all", dateOption: "tomorrow" });

  const recorded: string[] = [];
  const failed: Array<{ city: string; error: string | null }> = [];

  for (const outcome of outcomes) {
    if (!outcome.cheapest) {
      failed.push({ city: outcome.city, error: outcome.error });
      continue;
    }
    await recordDailySnapshot(outcome.city, outcome.country, fromDate, outcome.cheapest);
    recorded.push(outcome.city);
  }

  return jsonResponse({ ok: true, date: fromDate, recorded, failed });
}
