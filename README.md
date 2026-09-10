# İstanbul Çıkışlı Ucuz Uçuş Bulucu

İstanbul (IST + SAW) çıkışlı, önceden tanımlı bir destinasyon listesi için en
ucuz uçuşu bulan, Vercel üzerinde çalışacak sade bir Next.js uygulaması.

## Durum: feasibility doğrulama aşaması

Kod yazımına başlamadan önce Google Flights'tan gerçekten veri alınıp
alınamadığı doğrulanmalı (resmi/ücretli bir API kullanılmıyor). Bu ortamın
(sandbox) ağ politikası `google.com`'a tüm erişimi engellediği için doğrulama
**buradan yapılamadı** — bu Google'ın bot korumasından değil, ortamın
organizasyon ağ politikasından kaynaklanıyor.

Bu yüzden doğrulama Vercel'e deploy edilip orada yapılacak:

1. Bu repoyu Vercel'e bağlayıp deploy edin (bkz. aşağıdaki "Deploy" bölümü).
2. Deploy sonrası şu uç noktayı ziyaret edin:
   `https://<deploy-url>/api/feasibility?origin=IST&destination=FCO&date=2026-09-18`
3. Dönen JSON'da `ok: true` ve `resultCount > 0` ile gerçek fiyat/havayolu
   bilgisi geliyorsa veri katmanı çalışıyor demektir.
4. Sonucu paylaşın — **LOCAL: test edilemedi (ortam engeli) / VERCEL: çalışıyor
   veya çalışmıyor** olarak buraya işlenecek ve arama arayüzü ondan sonra
   eklenecek.

Eğer `ok: false` dönerse veya Vercel'in serverless IP'leri Google tarafından
engellenirse (bilinen bir risk — datacenter IP'ler sık CAPTCHA/403 alır),
alternatif bir mimari (örn. ayrı bir rezidansiyel proxy/scraping servisi)
değerlendirilmesi gerekecek.

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
  types.ts            – paylaşılan tipler (Airport, Destination, FlightResult, ...)
  destinations.ts      – kalkış havalimanları (IST, SAW) ve destinasyon config'i
  flights/
    provider.ts         – provider-agnostic arayüz (FlightProvider)
    google-flights.ts    – Google Flights'a özel implementasyon (izole)
    normalize.ts         – Google'ın gömülü sayfa verisini parse etme
    index.ts             – FLIGHT_PROVIDER env değişkenine göre provider seçimi
app/
  page.tsx              – ana arama ekranı (veri doğrulanınca eklenecek)
  api/feasibility/route.ts – manuel veri-erişimi doğrulama uç noktası
```

Google Flights'ın resmi bir API'si yok. Bu uygulama, Google'ın herkese açık
`google.com/travel/flights` arama sayfasını sunucu tarafında (tarayıcıdan
değil) çekip sayfaya gömülü `AF_initDataCallback({key: 'ds:1', ...})` JS
verisini okuyor — yaklaşım [MarsLuay/CheapestFlightPicker](https://github.com/MarsLuay/CheapestFlightPicker/tree/main/docs)
projesinden referans alınmıştır. Bu resmi olmayan bir yöntem olduğu için
tamamı `lib/flights/google-flights.ts` ve `lib/flights/normalize.ts` içinde
izole edilmiştir; uygulamanın geri kalanı yalnızca `FlightProvider`
arayüzünü bilir.

## Geliştirme

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Deploy (Vercel)

1. Bu repoyu GitHub'da Vercel'e bağlayın (Vercel dashboard → Add New Project
   → bu repoyu seçin) ya da Vercel CLI ile:
   ```bash
   npx vercel --prod
   ```
2. Environment variable eklemeye gerek yok (`FLIGHT_PROVIDER` opsiyonel,
   varsayılan `google`).
3. Deploy tamamlanınca `/api/feasibility` uç noktasını test edin (yukarıya
   bakın).

Vercel Free (Hobby) planında serverless function süresi sınırlıdır; bu route
`maxDuration = 30` ile ayarlandı.
