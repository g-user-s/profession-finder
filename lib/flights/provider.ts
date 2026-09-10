/**
 * Provider-agnostic contract. UI and route handlers depend only on this file
 * (and the shared `FlightResult` type), never on a specific provider's
 * request/response shape, so a second provider can be added later without
 * touching the rest of the app.
 */
export type FlightSearchParams = {
  origin: string;
  destination: string;
  departureDate: string; // YYYY-MM-DD
};

export type RawFlightOption = {
  price: number;
  currency: string;
  airline?: string;
  stops?: number;
  durationMinutes?: number;
  bookingUrl?: string;
};

export interface FlightProvider {
  searchOneWay(params: FlightSearchParams): Promise<RawFlightOption[]>;
}
