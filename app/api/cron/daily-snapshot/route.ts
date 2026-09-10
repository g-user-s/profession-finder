import { NextResponse } from "next/server";
import { resolveDateRange } from "@/lib/dates";
import { recordDailySnapshot } from "@/lib/dailySnapshot";
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Redis yapılandırılmamış. Vercel dashboard → Storage → Upstash for Redis entegrasyonunu bu projeye ekleyin (bkz. README)."
      },
      { status: 503 }
    );
  }

  const { fromDate } = resolveDateRange("tomorrow");
  const outcomes = await searchCheapestFlights({ city: "all", dateOption: "tomorrow" });

  const recorded: string[] = [];
  const failed: string[] = [];

  for (const outcome of outcomes) {
    if (!outcome.cheapest) {
      failed.push(outcome.city);
      continue;
    }
    await recordDailySnapshot(outcome.city, outcome.country, fromDate, outcome.cheapest);
    recorded.push(outcome.city);
  }

  return NextResponse.json({ ok: true, date: fromDate, recorded, failed });
}
