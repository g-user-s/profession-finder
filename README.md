# İstanbul Çıkışlı Ucuz Uçuş Bulucu

İstanbul (IST + SAW) çıkışlı, önceden tanımlı bir destinasyon listesi için en
ucuz uçuşu bulan, Vercel üzerinde çalışan sade bir Next.js uygulaması.

## Durum: veri katmanı doğrulandı ✅

Google Flights'ın resmi bir API'si yok, bu yüzden koda başlamadan önce veri
alınabildiği doğrulandı:

- **LOCAL (bu geliştirme ortamı):** test edilemedi — bu sandbox'ın ağ
  politikası `google.com`'un tamamına erişimi engelliyor (Google'ın bot
  korumasından değil, ortamın organizasyon politikasından kaynaklanıyor).
- **VERCEL: ÇALIŞIYOR** ✅ — `GET /api/feasibility?origin=IST&destination=FCO&date=2026-09-18`
  gerçek fiyat, havayolu, aktarma ve süre bilgisiyle sonuç döndürdü
  (örn. Lufthansa, 1 aktarma, 435 dk).

`/api/feasibility` uç noktası hâlâ mevcut; farklı rota/tarih kombinasyonlarını
manuel doğrulamak için kullanılabilir (`&hl=` ve `&curr=` ile locale override
edilebilir, sonuç bulunamazsa `htmlSnippet` ve `diagnostics` alanları nedeni
anlamaya yardımcı olur).

## Bilinen riskler / henüz doğrulanmamış varsayımlar

- **Tarih-aralığı fiyat grafiği:** "Bu Hafta"/"Bu Ay" aramaları, her gün için
  ayrı istek atmak yerine Google'ın sayfaya gömdüğü fiyat grafiğini
  (`data[5][10][0]`) tek istekle okuyup en ucuz tarihi bulur, sonra sadece o
  tarih için detaylı sorgu atar. Bu grafiğin gerçekten dolu geldiği ayrıca
  doğrulanmalı; boş gelirse kod otomatik olarak aralığın ilk gününe düşer
  (arama başarısız olmaz, sadece o gün için sonuç döner).
- **Vercel fonksiyon süresi:** "Tüm destinasyonlar" + "Bu Ay" seçimi en kötü
  senaryoda ~16 havalimanı çifti × 2 istek = ~32 Google isteği anlamına
  gelir (5'li eşzamanlılıkla). `/api/search` route'u `maxDuration = 60` ile
  ayarlandı; Vercel Hobby planınızda bu süre desteklenmiyorsa deploy sırasında
  hata alırsınız — bu durumda eşzamanlılığı (`AIRPORT_PAIR_CONCURRENCY`,
  `lib/search.ts`) düşürmek veya aramayı destinasyon başına ayrı isteklere
  bölmek gerekir.
- **Pico.css CDN:** `app/layout.tsx`, Pico.css'i `cdn.jsdelivr.net`'ten
  yükler (bu sandbox'ta bu adres de engelli olduğu için görsel doğrulama
  yapılamadı, ama etkileşim/form/arama akışı gerçek tarayıcıda test edildi).
  Gerçek kullanıcılarda bu CDN erişimi normal şartlarda sorun olmaz.

## Teknoloji

- Next.js (App Router) + TypeScript
- Pico.css (CDN, ekstra UI kütüphanesi yok)
- Vercel serverless functions (Node.js runtime)
- Harici ücretli uçuş API'si veya SerpApi **kullanılmıyor**

## Mimari

```
Browser → Next.js server (app/api/*) → lib/flights (provider katmanı) → Google Flights
```

```
lib/
  types.ts              – paylaşılan tipler (Airport, Destination, FlightResult, ...)
  destinations.ts        – kalkış havalimanları (IST, SAW) ve destinasyon config'i
  dates.ts                – Yarın/Bu Hafta/Bu Ay için Europe/Istanbul tabanlı tarih hesaplama
  search.ts               – arama orkestrasyonu: havalimanı çiftleri, eşzamanlılık, kısmi hata toleransı
  flights/
    provider.ts             – provider-agnostic arayüz (FlightProvider)
    google-flights.ts        – Google Flights'a özel implementasyon (izole)
    normalize.ts             – Google'ın gömülü sayfa verisini parse etme
    cache.ts                 – basit in-memory cache (Vercel'de kalıcı değil, bkz. aşağı)
    index.ts                 – FLIGHT_PROVIDER env değişkenine göre provider seçimi
app/
  page.tsx                – ana arama ekranı (client component)
  api/search/route.ts       – arama uç noktası (UI'ın çağırdığı)
  api/feasibility/route.ts  – manuel veri-erişimi doğrulama/debug uç noktası
components/
  DestinationResultCard.tsx – tek destinasyon sonucu (en ucuz + alternatifler)
```

Google Flights'ın resmi bir API'si yok. Bu uygulama, Google'ın herkese açık
`google.com/travel/flights` arama sayfasını sunucu tarafında (tarayıcıdan
değil) çekip sayfaya gömülü `AF_initDataCallback({key: 'ds:1', ...})` JS
verisini okuyor — yaklaşım [MarsLuay/CheapestFlightPicker](https://github.com/MarsLuay/CheapestFlightPicker/tree/main/docs)
projesinden referans alınmıştır. Bu resmi olmayan bir yöntem olduğu için
tamamı `lib/flights/google-flights.ts` ve `lib/flights/normalize.ts` içinde
izole edilmiştir; uygulamanın geri kalanı yalnızca `FlightProvider`
arayüzünü bilir.

### Cache

`lib/flights/cache.ts`, serverless fonksiyonun modül kapsamında yaşayan basit
bir `Map`'tir. Vercel'de bu **kalıcı değildir**: her cold start'ta boşalır,
paralel/ölçeklenen instance'lar birbirinden habersizdir. Sadece aynı sıcak
instance'a düşen tekrar isteklerde işe yarar. İleride gerçek paylaşılan cache
gerekirse (Redis/Vercel KV), sadece bu dosyadaki iki fonksiyon değiştirilir —
başka hiçbir yer etkilenmez.

## Geliştirme

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Deploy (Vercel)

1. Bu repoyu GitHub'da Vercel'e bağlayın (Vercel dashboard → Add New Project
   → bu repoyu seçin, branch: `main`) ya da Vercel CLI ile:
   ```bash
   npx vercel --prod
   ```
2. Environment variable eklemeye gerek yok (`FLIGHT_PROVIDER` opsiyonel,
   varsayılan `google`).
3. Deploy sonrası test:
   - `/api/feasibility?origin=IST&destination=FCO&date=2026-09-18` — tekil veri doğrulama
   - `/` — tam arama arayüzü
