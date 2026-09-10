import type { Airport, Destination } from "./types";

export const departureAirports: Airport[] = [
  { code: "IST", name: "Istanbul Airport" },
  { code: "SAW", name: "Sabiha Gökçen International Airport" }
];

export const destinations: Destination[] = [
  {
    city: "Roma",
    country: "İtalya",
    airports: ["FCO", "CIA"]
  },
  {
    city: "Paris",
    country: "Fransa",
    airports: ["CDG", "ORY", "BVA"]
  },
  {
    city: "Amsterdam",
    country: "Hollanda",
    airports: ["AMS"]
  },
  {
    city: "Düsseldorf",
    country: "Almanya",
    airports: ["DUS"]
  },
  {
    city: "Sevilla",
    country: "İspanya",
    airports: ["SVQ"]
  }
];

export function findDestinationByCity(city: string): Destination | undefined {
  return destinations.find((destination) => destination.city === city);
}
