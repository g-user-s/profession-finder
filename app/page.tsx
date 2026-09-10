"use client";

import { useState } from "react";
import { DestinationResultCard } from "@/components/DestinationResultCard";
import { destinations } from "@/lib/destinations";
import type { DateOption, DestinationSearchOutcome } from "@/lib/types";

const dateOptionLabels: Record<DateOption, string> = {
  tomorrow: "Yarın",
  this_week: "Bu Hafta",
  this_month: "Bu Ay"
};

export default function HomePage() {
  const [city, setCity] = useState<string>("all");
  const [dateOption, setDateOption] = useState<DateOption>("this_month");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DestinationSearchOutcome[] | null>(null);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const params = new URLSearchParams({ city, dateOption });
      const response = await fetch(`/api/search?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Uçuş fiyatları şu anda alınamadı.");
      }

      setResults(data.results);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Uçuş fiyatları şu anda alınamadı. Lütfen birkaç dakika sonra tekrar deneyin."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <hgroup>
        <h1>İstanbul'dan Ucuz Uçuşlar</h1>
        <p>IST ve SAW çıkışlı, seçtiğin döneme göre en ucuz uçuşları bulur.</p>
      </hgroup>

      <label htmlFor="destination">Nereye gitmek istiyorsun?</label>
      <select
        id="destination"
        value={city}
        onChange={(event) => setCity(event.target.value)}
      >
        <option value="all">Tüm destinasyonlar</option>
        {destinations.map((destination) => (
          <option key={destination.city} value={destination.city}>
            {destination.city}
          </option>
        ))}
      </select>

      <label>Ne zaman?</label>
      <div role="group">
        {(Object.keys(dateOptionLabels) as DateOption[]).map((option) => (
          <button
            key={option}
            type="button"
            className={option === dateOption ? "" : "outline"}
            onClick={() => setDateOption(option)}
          >
            {dateOptionLabels[option]}
          </button>
        ))}
      </div>

      <button type="button" onClick={handleSearch} aria-busy={loading} disabled={loading}>
        {loading ? "Aranıyor…" : "Ucuz Uçuşları Bul"}
      </button>

      {error && (
        <article>
          <p>{error}</p>
        </article>
      )}

      {results && (
        <section>
          <h2>
            {dateOptionLabels[dateOption]} İstanbul'dan en ucuz uçuşlar
          </h2>
          {results.length === 0 ? (
            <p>Sonuç bulunamadı.</p>
          ) : (
            results.map((outcome) => (
              <DestinationResultCard key={outcome.city} outcome={outcome} />
            ))
          )}
        </section>
      )}
    </>
  );
}
