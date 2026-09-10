import { NextResponse } from "next/server";
import {
  buildGoogleFlightsSearchUrl,
  fetchGoogleFlightsPage
} from "@/lib/flights/google-flights";
import {
  diagnosePageData,
  extractGoogleFlightsPageData,
  parseGoogleFlightsPageData
} from "@/lib/flights/normalize";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Manual feasibility check (see README): hit this route on the deployed
 * Vercel instance to confirm Google Flights data can actually be fetched
 * from a serverless function, before any UI depends on it.
 *
 * Example: /api/feasibility?origin=IST&destination=FCO&date=2026-09-18
 * Locale override for debugging: &hl=en&curr=USD (defaults shown)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin") ?? "IST";
  const destination = searchParams.get("destination") ?? "FCO";
  const date = searchParams.get("date") ?? "2026-09-18";
  const hl = searchParams.get("hl") ?? "en";
  const curr = searchParams.get("curr") ?? "USD";

  const url = buildGoogleFlightsSearchUrl(origin, destination, date, { hl, curr });
  const startedAt = Date.now();

  try {
    const page = await fetchGoogleFlightsPage(url);
    const data = extractGoogleFlightsPageData(page.html);
    const diagnostics = diagnosePageData(data);
    const options = data ? parseGoogleFlightsPageData(data) : [];

    return NextResponse.json({
      ok: page.status === 200 && options.length > 0,
      origin,
      destination,
      date,
      requestUrl: url,
      elapsedMs: Date.now() - startedAt,
      httpStatus: page.status,
      finalUrl: page.finalUrl,
      redirected: page.finalUrl !== url,
      htmlLength: page.html.length,
      diagnostics,
      resultCount: options.length,
      cheapest: options.length > 0 ? [...options].sort((a, b) => a.price - b.price)[0] : null,
      allResults: options,
      htmlSnippet: options.length === 0 ? page.html.slice(0, 1500) : undefined
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        origin,
        destination,
        date,
        requestUrl: url,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}
