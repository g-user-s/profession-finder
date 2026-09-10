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

function pad(value: number): string {
  return String(Math.max(0, value)).padStart(2, "0");
}

/**
 * Google stores clock times as [hour, minute], dropping the minute when
 * it's zero. These are local wall-clock times at each airport, so they're
 * read as digits and never routed through a Date — parsing them into one
 * would invite a timezone shift onto a value that already means what it
 * says.
 */
function readClockTime(timeParts: unknown): string | undefined {
  if (!Array.isArray(timeParts)) return undefined;
  const hour = timeParts[0];
  if (typeof hour !== "number") return undefined;
  const minute = typeof timeParts[1] === "number" ? timeParts[1] : 0;
  return `${pad(hour)}:${pad(minute)}`;
}

/** [year, month, day] → a comparable number, for spotting overnight arrivals. */
function readDateOrdinal(dateParts: unknown): number | undefined {
  if (!Array.isArray(dateParts)) return undefined;
  const [year, month, day] = dateParts;
  if (typeof year !== "number" || typeof month !== "number" || typeof day !== "number") {
    return undefined;
  }
  return Date.UTC(year, month - 1, day);
}

/**
 * `data[2]` and `data[3]` are Google's "best flights" and "other flights"
 * buckets; each entry's `route` (index 0) carries legs at index 2, and
 * `pricing` (index 1) carries the total price as the last element of its
 * first row. Leg fields (airline code/name, flight number, airport codes,
 * timestamps, duration) live at fixed indices Google does not document.
 */
export function parseGoogleFlightsPageData(
  data: unknown[],
  currency: string
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
    const lastLeg = legs[legs.length - 1];
    if (!Array.isArray(firstLeg) || !Array.isArray(lastLeg)) continue;

    const airlineName = firstLeg[22]?.[3];
    const durationMinutes = route[9];

    // Leg times: [8] departure clock, [10] arrival clock, [20]/[21] their
    // dates. Departure comes from the first leg and arrival from the last,
    // so a connecting itinerary reports the journey's real endpoints.
    const departureDay = readDateOrdinal(firstLeg[20]);
    const arrivalDay = readDateOrdinal(lastLeg[21]);
    const arrivesNextDay =
      departureDay !== undefined && arrivalDay !== undefined && arrivalDay > departureDay;

    options.push({
      price,
      currency,
      airline: typeof airlineName === "string" ? airlineName : undefined,
      stops: legs.length - 1,
      durationMinutes: typeof durationMinutes === "number" ? durationMinutes : undefined,
      departureTime: readClockTime(firstLeg[8]),
      arrivalTime: readClockTime(lastLeg[10]),
      arrivesNextDay,
      bookingUrl: undefined
    });
  }

  return options;
}

/**
 * Google's search page embeds a price-by-date graph (the same one behind
 * its UI's price graph tab) at data[5][10][0], as
 * [timestampMs, price][]. Reading it lets us learn the cheapest date across
 * a whole range from ONE page fetch instead of one fetch per candidate
 * date — the "efficient query method" the product spec asks for.
 */
export function parseGoogleFlightsPageDatePrices(
  data: unknown[],
  fromDate: string,
  toDate: string
): Array<{ date: string; price: number }> {
  const datePriceSection = data[5];
  const graph =
    Array.isArray(datePriceSection) && Array.isArray(datePriceSection[10])
      ? datePriceSection[10][0]
      : null;
  if (!Array.isArray(graph)) {
    return [];
  }

  return graph
    .map((entry): { date: string; price: number } | null => {
      if (!Array.isArray(entry) || typeof entry[0] !== "number") {
        return null;
      }
      const date = new Date(entry[0]).toISOString().slice(0, 10);
      const price = entry[1];
      if (date < fromDate || date > toDate || typeof price !== "number" || !Number.isFinite(price)) {
        return null;
      }
      return { date, price };
    })
    .filter((entry): entry is { date: string; price: number } => entry !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export type PageDataDiagnostics = {
  dataFound: boolean;
  topLevelLength: number | null;
  bucket2Length: number | null;
  bucket3Length: number | null;
  rawFlightEntryCount: number;
  datePriceGraphEntryCount: number;
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
      rawFlightEntryCount: 0,
      datePriceGraphEntryCount: 0
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

  const datePriceSection = data[5];
  const graph =
    Array.isArray(datePriceSection) && Array.isArray(datePriceSection[10])
      ? datePriceSection[10][0]
      : null;

  return {
    dataFound: true,
    topLevelLength: data.length,
    bucket2Length: Array.isArray(bucket2) ? bucket2.length : null,
    bucket3Length: Array.isArray(bucket3) ? bucket3.length : null,
    rawFlightEntryCount,
    datePriceGraphEntryCount: Array.isArray(graph) ? graph.length : 0
  };
}

export { extractGoogleFlightsPageData, readDurationLabel };
