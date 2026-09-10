import { NextResponse } from "next/server";
import { destinations } from "@/lib/destinations";
import { getAllLatestSnapshotsSafely } from "@/lib/dailySnapshot";

export const runtime = "nodejs";

/**
 * Serves the homepage's default view: the cheapest 4 destinations for
 * tomorrow, read straight from the daily cron's last snapshot (no live
 * Google Flights call on the request path — instant, and doesn't cost a
 * Google request per visitor).
 */
export async function GET() {
  const snapshots = await getAllLatestSnapshotsSafely(
    destinations.map((destination) => destination.city)
  );
  const top = snapshots
    .sort((a, b) => a.cheapest.price - b.cheapest.price)
    .slice(0, 4);

  return NextResponse.json({ snapshots: top });
}
