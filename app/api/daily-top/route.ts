import { NextResponse } from "next/server";
import { getDailyTop } from "@/lib/dailyTop";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The same data the homepage server-renders: the cheapest 4 destinations
 * for tomorrow. Served from the daily cron's Redis snapshot, or computed
 * live if that snapshot is missing/stale (see lib/dailyTop.ts).
 */
export async function GET() {
  const { snapshots, date, source } = await getDailyTop();
  return NextResponse.json({ date, source, snapshots });
}
