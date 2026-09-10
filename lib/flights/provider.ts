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

export type DatePriceRangeParams = {
  origin: string;
  destination: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
};

export type DatePrice = {
  date: string;
  price: number;
  currency: string;
};

export interface FlightProvider {
  searchOneWay(params: FlightSearchParams): Promise<RawFlightOption[]>;
  /**
   * Cheapest price per date across a range, from as few requests as the
   * provider needs (ideally one). Used to find which single date is worth
   * an exact-flight lookup, instead of querying every candidate date.
   */
  searchDatePriceRange(params: DatePriceRangeParams): Promise<DatePrice[]>;
}
