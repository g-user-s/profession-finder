/**
 * Google Flights has no official/public API. This provider fetches Google's
 * own public search page and reads the flight data embedded in it — the
 * same unofficial approach documented in
 * https://github.com/MarsLuay/CheapestFlightPicker/tree/main/docs.
 *
 * This is the ONLY file (besides normalize.ts) that knows anything about
 * Google's page format. Swapping in a different data source later means
 * writing a new file that implements `FlightProvider` — nothing else in the
 * app should change.
 */
import { extractGoogleFlightsPageData, parseGoogleFlightsPageData } from "./normalize";
import type { FlightProvider, FlightSearchParams, RawFlightOption } from "./provider";

const GOOGLE_FLIGHTS_PAGE_URL = "https://www.google.com/travel/flights";
const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

export function buildGoogleFlightsSearchUrl(
  origin: string,
  destination: string,
  departureDate: string,
  locale: { hl: string; curr: string } = { hl: "en", curr: "USD" }
): string {
  const query = `${origin}-${destination}-${departureDate}`;
  return `${GOOGLE_FLIGHTS_PAGE_URL}?q=${encodeURIComponent(query)}&hl=${locale.hl}&curr=${locale.curr}`;
}

export type FetchedGoogleFlightsPage = {
  requestUrl: string;
  finalUrl: string;
  status: number;
  html: string;
};

/**
 * Fetches Google's public search page directly. Exported (in addition to
 * being used by GoogleFlightsProvider below) so /api/feasibility can inspect
 * the raw response — status, final URL after redirects, HTML length — when
 * diagnosing why a query returned no results.
 */
export async function fetchGoogleFlightsPage(
  url: string
): Promise<FetchedGoogleFlightsPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        referer: GOOGLE_FLIGHTS_PAGE_URL,
        "user-agent": USER_AGENT
      }
    });

    const html = await response.text();
    return {
      requestUrl: url,
      finalUrl: response.url,
      status: response.status,
      html
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class GoogleFlightsProvider implements FlightProvider {
  async searchOneWay(params: FlightSearchParams): Promise<RawFlightOption[]> {
    const url = buildGoogleFlightsSearchUrl(
      params.origin,
      params.destination,
      params.departureDate
    );

    const page = await fetchGoogleFlightsPage(url);
    if (page.status !== 200) {
      throw new Error(
        `Google Flights sayfası ${page.status} döndü (${params.origin} -> ${params.destination})`
      );
    }

    const data = extractGoogleFlightsPageData(page.html);
    if (!data) {
      throw new Error(
        `Google Flights sayfasından veri çıkarılamadı (${params.origin} -> ${params.destination}). Sayfa yapısı değişmiş olabilir.`
      );
    }

    const options = parseGoogleFlightsPageData(data);
    return options.map((option) => ({ ...option, bookingUrl: url }));
  }
}
