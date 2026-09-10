export type Airport = {
  code: string;
  name: string;
};

export type Destination = {
  city: string;
  country: string;
  airports: string[];
};

export type FlightResult = {
  origin: string;
  destination: string;
  departureDate: string;
  price: number;
  currency: string;
  airline?: string;
  stops?: number;
  duration?: string;
  /** Local wall-clock times at each airport, "HH:MM". */
  departureTime?: string;
  arrivalTime?: string;
  arrivesNextDay?: boolean;
  bookingUrl?: string;
};

export type DateOption = "tomorrow" | "this_week" | "this_month";

export type DestinationSearchOutcome = {
  city: string;
  country: string;
  cheapest: FlightResult | null;
  alternatives: FlightResult[];
  error: string | null;
};
