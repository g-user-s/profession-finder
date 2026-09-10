"use client";

import { useState } from "react";
import type { DestinationSearchOutcome, FlightResult } from "@/lib/types";

function formatPrice(result: FlightResult): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: result.currency,
    maximumFractionDigits: 0
  }).format(result.price);
}

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function FlightLine({ result }: { result: FlightResult }) {
  return (
    <div>
      <p>
        <strong>
          {result.origin} → {result.destination}
        </strong>{" "}
        · {formatDate(result.departureDate)}
      </p>
      <p>
        <strong>{formatPrice(result)}</strong>
        {result.airline ? ` · ${result.airline}` : ""}
        {typeof result.stops === "number"
          ? ` · ${result.stops === 0 ? "Direkt" : `${result.stops} aktarma`}`
          : ""}
        {result.duration ? ` · ${result.duration}` : ""}
      </p>
      {result.bookingUrl && (
        <p>
          <a href={result.bookingUrl} target="_blank" rel="noreferrer">
            Uçuşu Gör
          </a>
        </p>
      )}
    </div>
  );
}

export function DestinationResultCard({ outcome }: { outcome: DestinationSearchOutcome }) {
  const [showAlternatives, setShowAlternatives] = useState(false);

  return (
    <article>
      <header>
        <strong>
          {outcome.city}, {outcome.country}
        </strong>
      </header>

      {outcome.cheapest ? (
        <>
          <FlightLine result={outcome.cheapest} />
          {outcome.alternatives.length > 0 && (
            <>
              <button
                type="button"
                className="outline secondary"
                onClick={() => setShowAlternatives((value) => !value)}
              >
                {showAlternatives
                  ? "Alternatifleri gizle"
                  : `Alternatif uçuşları gör (${outcome.alternatives.length})`}
              </button>
              {showAlternatives && (
                <div>
                  {outcome.alternatives.map((alternative, index) => (
                    <div key={index}>
                      <hr />
                      <FlightLine result={alternative} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <p>{outcome.error ?? "Veri alınamadı"}</p>
      )}
    </article>
  );
}
