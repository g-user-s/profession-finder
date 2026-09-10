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
import {
  extractGoogleFlightsPageData,
  parseGoogleFlightsPageData,
  parseGoogleFlightsPageDatePrices
} from "./normalize";
import type {
  DatePrice,
  DatePriceRangeParams,
  FlightProvider,
  FlightSearchParams,
  RawFlightOption
} from "./provider";

const GOOGLE_FLIGHTS_PAGE_URL = "https://www.google.com/travel/flights";
const REQUEST_TIMEOUT_MS = 12_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/** Fixed for the whole app: Turkish-market product, prices shown in ₺. */
const LOCALE = { hl: "tr", curr: "TRY" };

export function buildGoogleFlightsSearchUrl(
  origin: string,
  destination: string,
  departureDate: string,
  locale: { hl: string; curr: string } = LOCALE
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
        "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
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

async function fetchPageData(url: string, context: string): Promise<unknown[]> {
  const page = await fetchGoogleFlightsPage(url);
  if (page.status !== 200) {
    throw new Error(`Google Flights sayfası ${page.status} döndü (${context})`);
  }

  const data = extractGoogleFlightsPageData(page.html);
  if (!data) {
    throw new Error(
      `Google Flights sayfasından veri çıkarılamadı (${context}). Sayfa yapısı değişmiş olabilir.`
    );
  }

  return data;
}

export class GoogleFlightsProvider implements FlightProvider {
  async searchOneWay(params: FlightSearchParams): Promise<RawFlightOption[]> {
    const url = buildGoogleFlightsSearchUrl(
      params.origin,
      params.destination,
      params.departureDate
    );

    const data = await fetchPageData(url, `${params.origin} -> ${params.destination}`);
    const options = parseGoogleFlightsPageData(data, LOCALE.curr);
    return options.map((option) => ({ ...option, bookingUrl: url }));
  }

  async searchDatePriceRange(params: DatePriceRangeParams): Promise<DatePrice[]> {
    // A single query date is required by Google's page; its embedded price
    // graph still covers the surrounding range, so we query `fromDate` and
    // filter the graph down to [fromDate, toDate].
    const url = buildGoogleFlightsSearchUrl(params.origin, params.destination, params.fromDate);
    const data = await fetchPageData(url, `${params.origin} -> ${params.destination} (calendar)`);
    const prices = parseGoogleFlightsPageDatePrices(data, params.fromDate, params.toDate);
    return prices.map((entry) => ({ ...entry, currency: LOCALE.curr }));
  }
}
