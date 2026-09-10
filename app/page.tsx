export default function HomePage() {
  return (
    <article>
      <hgroup>
        <h1>İstanbul'dan Ucuz Uçuşlar</h1>
        <p>Arama arayüzü, veri kaynağı doğrulanana kadar bilerek eklenmedi.</p>
      </hgroup>
      <p>
        Bu proje şu anda <strong>feasibility (veri erişimi) doğrulama</strong>{" "}
        aşamasında. Google Flights verisinin bu Vercel dağıtımından gerçekten
        çekilebildiğini önce{" "}
        <a href="/api/feasibility?origin=IST&amp;destination=FCO&amp;date=2026-09-18">
          /api/feasibility
        </a>{" "}
        uç noktasından doğrulayın. Sonuç olumluysa arama arayüzü bir sonraki
        adımda eklenecek.
      </p>
    </article>
  );
}
