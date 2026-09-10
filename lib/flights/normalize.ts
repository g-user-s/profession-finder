/**
 * Parsing for Google's public travel/flights page response.
 *
 * Google Flights has no public API. The page embeds its search results as a
 * JS literal inside `AF_initDataCallback({key: 'ds:1', ..., data: [...] })`.
 * This is the same array Google's own frontend reads to render the page, so
 * the shape below is undocumented and can change without notice — that risk
 * is exactly why this file is isolated from the rest of the app.
 *
 * Approach adapted from the open-source reference project
 * https://github.com/MarsLuay/CheapestFlightPicker (docs/), which found the
 * signed internal batchexecute endpoint now rejects unsigned calls (HTTP 200
 * with gRPC status 13), while the public page's embedded data still works.
 */
import type { RawFlightOption } from "./provider";

function extractGoogleFlightsPageData(html: string): unknown[] | null {
  const callbackStart = html.indexOf("AF_initDataCallback({key: 'ds:1'");
  if (callbackStart < 0) {
    return null;
  }

  const dataStart = html.indexOf("data:", callbackStart);
  if (dataStart < 0) {
    return null;
  }

  let arrayStart = dataStart + "data:".length;
  while (/\s/u.test(html[arrayStart] ?? "")) {
    arrayStart += 1;
  }
  if (html[arrayStart] !== "[") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const data: unknown = JSON.parse(html.slice(arrayStart, index + 1));
          return Array.isArray(data) ? data : null;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function readDurationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}s ${remaining}dk`;
}

/**
 * `data[2]` and `data[3]` are Google's "best flights" and "other flights"
 * buckets; each entry's `route` (index 0) carries legs at index 2, and
 * `pricing` (index 1) carries the total price as the last element of its
 * first row. Leg fields (airline code/name, flight number, airport codes,
 * timestamps, duration) live at fixed indices Google does not document.
 */
export function parseGoogleFlightsPageData(
  data: unknown[]
): RawFlightOption[] {
  const rawFlights: unknown[] = [];
  for (const index of [2, 3]) {
    const bucket = data[index];
    if (Array.isArray(bucket) && Array.isArray(bucket[0])) {
      rawFlights.push(...bucket[0]);
    }
  }

  const options: RawFlightOption[] = [];

  for (const entry of rawFlights) {
    if (!Array.isArray(entry)) continue;
    const route = entry[0];
    const pricing = entry[1];
    if (!Array.isArray(route) || !Array.isArray(pricing)) continue;

    const priceRow = pricing[0];
    const price = Array.isArray(priceRow) ? priceRow[priceRow.length - 1] : undefined;
    const legs = route[2];
    if (!Array.isArray(legs) || typeof price !== "number") continue;

    const firstLeg = legs[0];
    if (!Array.isArray(firstLeg)) continue;

    const airlineName = firstLeg[22]?.[3];
    const durationMinutes = route[9];

    options.push({
      price,
      currency: "USD",
      airline: typeof airlineName === "string" ? airlineName : undefined,
      stops: legs.length - 1,
      durationMinutes: typeof durationMinutes === "number" ? durationMinutes : undefined,
      bookingUrl: undefined
    });
  }

  return options;
}

export type PageDataDiagnostics = {
  dataFound: boolean;
  topLevelLength: number | null;
  bucket2Length: number | null;
  bucket3Length: number | null;
  rawFlightEntryCount: number;
};

/**
 * Feasibility-debugging helper: reports the shape of the extracted ds:1
 * array without needing to dump the (large, undocumented) payload itself.
 * Used only by /api/feasibility, never by the real search path.
 */
export function diagnosePageData(data: unknown[] | null): PageDataDiagnostics {
  if (!data) {
    return {
      dataFound: false,
      topLevelLength: null,
      bucket2Length: null,
      bucket3Length: null,
      rawFlightEntryCount: 0
    };
  }

  const bucket2 = data[2];
  const bucket3 = data[3];
  let rawFlightEntryCount = 0;
  for (const bucket of [bucket2, bucket3]) {
    if (Array.isArray(bucket) && Array.isArray(bucket[0])) {
      rawFlightEntryCount += bucket[0].length;
    }
  }

  return {
    dataFound: true,
    topLevelLength: data.length,
    bucket2Length: Array.isArray(bucket2) ? bucket2.length : null,
    bucket3Length: Array.isArray(bucket3) ? bucket3.length : null,
    rawFlightEntryCount
  };
}

export { extractGoogleFlightsPageData, readDurationLabel };
