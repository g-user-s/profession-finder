import { NextResponse } from "next/server";
import { getFlightProvider } from "@/lib/flights";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Manual feasibility check (see AGENTS/README): hit this route on the
 * deployed Vercel instance to confirm Google Flights data can actually be
 * fetched from a serverless function, before any UI depends on it.
 *
 * Example: /api/feasibility?origin=IST&destination=FCO&date=2026-09-18
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin") ?? "IST";
  const destination = searchParams.get("destination") ?? "FCO";
  const date = searchParams.get("date") ?? "2026-09-18";

  const provider = getFlightProvider();
  const startedAt = Date.now();

  try {
    const options = await provider.searchOneWay({
      origin,
      destination,
      departureDate: date
    });

    return NextResponse.json({
      ok: true,
      origin,
      destination,
      date,
      elapsedMs: Date.now() - startedAt,
      resultCount: options.length,
      cheapest: options.length > 0
        ? [...options].sort((a, b) => a.price - b.price)[0]
        : null,
      allResults: options
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        origin,
        destination,
        date,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}
