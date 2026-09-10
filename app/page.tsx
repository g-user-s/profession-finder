import type { DailyDestinationSnapshot } from "@/lib/dailySnapshot";
import { getDailyTop } from "@/lib/dailyTop";
import { getDestinationImage } from "@/lib/destinationImages";
import { destinations } from "@/lib/destinations";

// Reads Redis (and, before the first cron run, falls back to a live
// search) on every request — this must never be statically prerendered at
// build time, since neither is available then.
export const dynamic = "force-dynamic";
// Only the live fallback path is slow; the normal Redis read is instant.
export const maxDuration = 60;

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function DealCard({ snapshot }: { snapshot: DailyDestinationSnapshot }) {
  const { cheapest } = snapshot;
  const image = getDestinationImage(snapshot.city);
  const detailParts: string[] = [];
  if (cheapest.airline) detailParts.push(cheapest.airline);
  if (typeof cheapest.stops === "number") {
    detailParts.push(cheapest.stops === 0 ? "Direkt" : `${cheapest.stops} aktarma`);
  }
  if (cheapest.duration) detailParts.push(cheapest.duration);

  return (
    <article className="deal-card">
      {image ? (
        // Plain <img>, not next/image: these are a handful of fixed local
        // files, and Vercel's Hobby plan meters image optimization.
        <div className="deal-card__media">
          <img src={image} alt={`${snapshot.city}, ${snapshot.country}`} loading="lazy" />
          <div className="deal-card__media-label">
            <strong>{snapshot.city}</strong>
            <span>{snapshot.country}</span>
          </div>
        </div>
      ) : (
        <header>
          <strong>
            {snapshot.city}, {snapshot.country}
          </strong>
        </header>
      )}

      {snapshot.discountPercent !== null && (
        <span className="deal-card__badge">
          Normalden %{snapshot.discountPercent} daha ucuz
        </span>
      )}

      <p className="deal-card__route">
        {cheapest.origin} → {cheapest.destination} · {formatDate(cheapest.departureDate)}
      </p>

      <p className="deal-card__price">
        {snapshot.baseline !== null && (
          <span className="deal-card__baseline">
            {formatPrice(snapshot.baseline, cheapest.currency)}
          </span>
        )}
        <strong className="deal-card__price-main">
          {formatPrice(cheapest.price, cheapest.currency)}
        </strong>
      </p>

      {detailParts.length > 0 && <p className="deal-card__meta">{detailParts.join(" · ")}</p>}

      {cheapest.bookingUrl && (
        <a href={cheapest.bookingUrl} target="_blank" rel="noreferrer">
          Uçuşu Gör
        </a>
      )}
    </article>
  );
}

export default async function HomePage() {
  const { snapshots: dailyTop } = await getDailyTop();

  return (
    <>
      <hgroup>
        <h1>İstanbul'dan Ucuz Uçuşlar</h1>
        <p>IST ve SAW çıkışlı, seçtiğin döneme göre en ucuz uçuşları bulur.</p>
      </hgroup>

      <section id="daily-top">
        <h2>Yarın için en ucuz fırsatlar</h2>
        {dailyTop.length === 0 ? (
          <p>
            Uçuş fiyatları şu anda alınamadı. Lütfen birkaç dakika sonra tekrar deneyin —
            liste her sabah 09:00'da (İstanbul saati) yenilenir.
          </p>
        ) : (
          <div className="deal-grid">
            {dailyTop.map((snapshot) => (
              <DealCard key={snapshot.city} snapshot={snapshot} />
            ))}
          </div>
        )}
      </section>

      <hr />

      <label htmlFor="destination">Nereye gitmek istiyorsun?</label>
      <select id="destination" defaultValue="all">
        <option value="all">Tüm destinasyonlar</option>
        {destinations.map((destination) => (
          <option key={destination.city} value={destination.city}>
            {destination.city}
          </option>
        ))}
      </select>

      <label>Ne zaman?</label>
      <div role="group">
        <button type="button" className="outline" data-date-option="tomorrow">
          Yarın
        </button>
        <button type="button" className="outline" data-date-option="this_week">
          Bu Hafta
        </button>
        <button type="button" data-date-option="this_month">
          Bu Ay
        </button>
      </div>

      <button type="button" id="search-button">
        Ucuz Uçuşları Bul
      </button>

      <article id="error-box" hidden />

      <section id="results" hidden>
        <h2 id="results-heading" />
        <div id="results-list" />
      </section>

      <script src="/app.js" defer />
    </>
  );
}
