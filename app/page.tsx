import { destinations } from "@/lib/destinations";

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
        <button type="button" data-date-option="this_month" data-active="true">
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
