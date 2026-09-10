/**
 * Card photos, served from public/destinations/. ASCII slugs on purpose —
 * "Düsseldorf.jpg" would mean percent-encoded, encoding-sensitive URLs for
 * no benefit.
 *
 * Missing entries are fine: the card just renders without a photo.
 */
const destinationImages: Record<string, string> = {
  Roma: "/destinations/roma.jpg",
  Paris: "/destinations/paris.jpg",
  Amsterdam: "/destinations/amsterdam.jpg",
  Düsseldorf: "/destinations/dusseldorf.jpg",
  Sevilla: "/destinations/sevilla.jpg"
};

export function getDestinationImage(city: string): string | null {
  return destinationImages[city] ?? null;
}
