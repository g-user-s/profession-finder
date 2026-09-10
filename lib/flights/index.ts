import { GoogleFlightsProvider } from "./google-flights";
import type { FlightProvider } from "./provider";

export type { FlightProvider, FlightSearchParams, RawFlightOption } from "./provider";

/**
 * Central place that picks a provider from FLIGHT_PROVIDER. The rest of the
 * app calls getFlightProvider() and only ever sees the FlightProvider
 * interface, so adding a second provider later is a one-line change here.
 */
export function getFlightProvider(): FlightProvider {
  const providerName = process.env.FLIGHT_PROVIDER ?? "google";

  switch (providerName) {
    case "google":
      return new GoogleFlightsProvider();
    default:
      throw new Error(`Bilinmeyen FLIGHT_PROVIDER: ${providerName}`);
  }
}
