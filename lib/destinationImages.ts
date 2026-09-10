/**
 * Card photos.
 *
 * These are hotlinked from an external host for now, by choice — if that
 * host goes away or blocks hotlinking, the cards lose their photos. Moving
 * them into public/destinations/ and swapping these for local paths is a
 * one-line-per-entry change; nothing else depends on where they live.
 *
 * Missing entries are fine: the card just renders without a photo.
 */
const IMAGE_BASE = "https://bisque-wolverine-754767.hostingersite.com/r";

const destinationImages: Record<string, string> = {
  Roma: `${IMAGE_BASE}/huba.jpg`,
  Paris: `${IMAGE_BASE}/niwi.jpg`,
  Amsterdam: `${IMAGE_BASE}/iate.jpg`,
  Düsseldorf: `${IMAGE_BASE}/jupa.jpg`,
  Sevilla: `${IMAGE_BASE}/zeho.jpg`
};

export function getDestinationImage(city: string): string | null {
  return destinationImages[city] ?? null;
}
