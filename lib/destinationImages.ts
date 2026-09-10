/**
 * Card photos, migrating from an external host into the repo one at a
 * time. A local path under public/destinations/ is the destination state;
 * the remaining IMAGE_BASE entries still depend on that host staying up.
 *
 * Missing entries are fine: the card just renders without a photo.
 */
const IMAGE_BASE = "https://bisque-wolverine-754767.hostingersite.com/r";

const destinationImages: Record<string, string> = {
  Roma: "/destinations/roma.jpg",
  Paris: `${IMAGE_BASE}/niwi.jpg`,
  Amsterdam: `${IMAGE_BASE}/iate.jpg`,
  Düsseldorf: "/destinations/dusseldorf.jpg",
  Sevilla: `${IMAGE_BASE}/zeho.jpg`
};

export function getDestinationImage(city: string): string | null {
  return destinationImages[city] ?? null;
}
