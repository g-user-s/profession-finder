import { destinations } from "@/lib/destinations";

/** UI-only decoration, not part of the Destination domain type. */
const destinationTaglines: Record<string, string> = {
  Roma: "Kolezyum, tarihi merkez ve İtalyan mutfağı",
  Paris: "Eyfel Kulesi, sanat ve şehir hayatı",
  Amsterdam: "Kanallar, müzeler ve bisiklet kültürü",
  Düsseldorf: "Ren Nehri kıyısı ve modern mimari",
  Sevilla: "Endülüs mimarisi ve flamenko"
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rendered as a plain HTML string (not JSX) so it can go through
 * dangerouslySetInnerHTML below — React treats that content as opaque and
 * never diffs it during hydration, which is what lets app.js freely
 * overwrite results-list without a hydration-mismatch race. This also means
 * the page shows real destination cards on first paint even if app.js is
 * slow to load or fails, instead of a blank section.
 */
const resultsSkeletonHtml = destinations
  .map((destination) => {
    const tagline = destinationTaglines[destination.city] ?? "";
    return (
      "<article><header><strong>" +
      escapeHtml(destination.city) +
      ", " +
      escapeHtml(destination.country) +
      "</strong></header>" +
      (tagline ? "<p>" + escapeHtml(tagline) + "</p>" : "") +
      '<p aria-busy="true">Fiyat yükleniyor…</p></article>'
    );
  })
  .join("");

export default function HomePage() {
  return (
    <>
      <hgroup>
        <h1>İstanbul'dan Ucuz Uçuşlar</h1>
        <p>IST ve SAW çıkışlı, seçtiğin döneme göre en ucuz uçuşları bulur.</p>
      </hgroup>

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

      {/*
        app.js mutates these on load and on every search. suppressHydrationWarning
        tells React that's expected here instead of reporting a mismatch.
      */}
      <button type="button" id="search-button" suppressHydrationWarning>
        Ucuz Uçuşları Bul
      </button>

      <article id="error-box" hidden suppressHydrationWarning />

      <section id="results">
        <h2 id="results-heading" suppressHydrationWarning>
          Bu Ay İstanbul'dan en ucuz uçuşlar
        </h2>
        <div id="results-list" dangerouslySetInnerHTML={{ __html: resultsSkeletonHtml }} />
      </section>

      <script src="/app.js" defer />
    </>
  );
}
