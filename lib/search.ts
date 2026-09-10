import { departureAirports, destinations } from "./destinations";
import { resolveDateRange } from "./dates";
import { getFlightProvider } from "./flights";
import type { FlightProvider } from "./flights/provider";
import { getCached, setCached } from "./flights/cache";
import { readDurationLabel } from "./flights/normalize";
import type { DateOption, Destination, DestinationSearchOutcome, FlightResult } from "./types";

/**
 * Cap concurrent Google Flights requests for one search. This is applied
 * once across every destination, not per destination — Google rate-limits
 * per client, so a per-destination cap would still let five destinations
 * fire five requests each at the same moment.
 */
const AIRPORT_PAIR_CONCURRENCY = 5;

const GENERIC_ERROR =
  "Uçuş fiyatları şu anda alınamadı. Lütfen birkaç dakika sonra tekrar deneyin.";

export type SearchInput = {
  /** One city, a specific set of them, or every destination. */
  city: string | string[] | "all";
  dateOption: DateOption;
};

function selectDestinations(city: SearchInput["city"]): Destination[] {
  if (city === "all") return destinations;
  const wanted = new Set(Array.isArray(city) ? city : [city]);
  return destinations.filter((destination) => wanted.has(destination.city));
}

export async function searchCheapestFlights(
  input: SearchInput
): Promise<DestinationSearchOutcome[]> {
  const { fromDate, toDate } = resolveDateRange(input.dateOption);
  const targetDestinations = selectDestinations(input.city);

  const provider = getFlightProvider();
  const pairs = targetDestinations.flatMap((destination) =>
    departureAirports.flatMap((origin) =>
      destination.airports.map((destinationAirport) => ({
        city: destination.city,
        origin: origin.code,
        destinationAirport
      }))
    )
  );

  const settled = await mapWithConcurrency(pairs, AIRPORT_PAIR_CONCURRENCY, (pair) =>
    searchAirportPair(provider, pair.origin, pair.destinationAirport, fromDate, toDate)
  );

  const resultsByCity = new Map<string, FlightResult[]>();
  const errorByCity = new Map<string, string>();

  settled.forEach((outcome, index) => {
    const city = pairs[index]!.city;
    if (outcome.status === "fulfilled") {
      if (outcome.value) {
        const existing = resultsByCity.get(city) ?? [];
        existing.push(outcome.value);
        resultsByCity.set(city, existing);
      }
      return;
    }

    errorByCity.set(
      city,
      outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
    );
  });

  return targetDestinations
    .map((destination) => toOutcome(destination, resultsByCity, errorByCity))
    .sort((a, b) => {
      if (a.cheapest && b.cheapest) return a.cheapest.price - b.cheapest.price;
      if (a.cheapest) return -1;
      if (b.cheapest) return 1;
      return 0;
    });
}

function toOutcome(
  destination: Destination,
  resultsByCity: Map<string, FlightResult[]>,
  errorByCity: Map<string, string>
): DestinationSearchOutcome {
  const results = [...(resultsByCity.get(destination.city) ?? [])].sort(
    (a, b) => a.price - b.price
  );

  return {
    city: destination.city,
    country: destination.country,
    cheapest: results[0] ?? null,
    alternatives: results.slice(1),
    error:
      results.length === 0 ? (errorByCity.get(destination.city) ?? GENERIC_ERROR) : null
  };
}

async function searchAirportPair(
  provider: FlightProvider,
  origin: string,
  destinationAirport: string,
  fromDate: string,
  toDate: string
): Promise<FlightResult | null> {
  const cacheKey = `${origin}-${destinationAirport}-${fromDate}-${toDate}`;
  const cached = getCached<FlightResult | null>(cacheKey);
  if (cached !== undefined) return cached;

  const result = await fetchCheapestForAirportPair(
    provider,
    origin,
    destinationAirport,
    fromDate,
    toDate
  );
  setCached(cacheKey, result);
  return result;
}

async function fetchCheapestForAirportPair(
  provider: FlightProvider,
  origin: string,
  destinationAirport: string,
  fromDate: string,
  toDate: string
): Promise<FlightResult | null> {
  let targetDate = fromDate;

  if (fromDate !== toDate) {
    // One calendar request covers the whole range instead of one request
    // per candidate date. If it comes back empty, fall back to fromDate.
    const datePrices = await provider.searchDatePriceRange({
      origin,
      destination: destinationAirport,
      fromDate,
      toDate
    });
    if (datePrices.length > 0) {
      targetDate = datePrices.reduce((cheapest, entry) =>
        entry.price < cheapest.price ? entry : cheapest
      ).date;
    }
  }

  const options = await provider.searchOneWay({
    origin,
    destination: destinationAirport,
    departureDate: targetDate
  });

  if (options.length === 0) return null;

  const cheapest = options.reduce((best, option) => (option.price < best.price ? option : best));

  return {
    origin,
    destination: destinationAirport,
    departureDate: targetDate,
    price: cheapest.price,
    currency: cheapest.currency,
    airline: cheapest.airline,
    stops: cheapest.stops,
    duration:
      typeof cheapest.durationMinutes === "number"
        ? readDurationLabel(cheapest.durationMinutes)
        : undefined,
    bookingUrl: cheapest.bookingUrl
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]!) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
