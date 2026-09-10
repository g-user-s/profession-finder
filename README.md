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
  gerçek fiyat, havayolu, aktarma ve süre bilgisiyle sonuç döndürdü.

`/api/feasibility` hâlâ mevcut; farklı rota/tarih kombinasyonlarını manuel
doğrulamak için kullanılabilir (`&hl=` ve `&curr=` ile locale override
edilebilir, sonuç bulunamazsa `htmlSnippet` ve `diagnostics` alanları nedeni
anlamaya yardımcı olur).

## Teknoloji

- Next.js (App Router) + TypeScript
- Pico.css (CDN) + küçük bir özel `public/styles.css` (fırsat kartları için)
- Vanilla JavaScript (`public/app.js`) — manuel arama formunun tüm etkileşimi,
  React state kullanılmıyor
- Vercel serverless functions (Node.js runtime) + Vercel Cron
- Upstash Redis (Vercel Marketplace, ücretsiz katman) — günlük fiyat geçmişi
- Harici ücretli uçuş API'si veya SerpApi **kullanılmıyor**
- Destinasyon fotoğrafları repoda: `public/destinations/` (eşleme
  `lib/destinationImages.ts`). Harici bir görsel sunucusuna bağımlılık yok.

## Mimari

```
Browser → Next.js server (app/api/*) → lib/flights (provider katmanı) → Google Flights
                                      → lib/dailySnapshot.ts → Upstash Redis
```

```
lib/
  types.ts                – paylaşılan tipler (Airport, Destination, FlightResult, ...)
  destinations.ts          – kalkış havalimanları (IST, SAW) ve destinasyon config'i
  dates.ts                  – Yarın/Bu Hafta/Bu Ay için Europe/Istanbul tabanlı tarih hesaplama
  search.ts                 – arama orkestrasyonu: havalimanı çiftleri, eşzamanlılık, kısmi hata toleransı
  pricing.ts                 – medyan/indirim-yüzdesi hesaplama (bkz. "Ortalama fiyat" aşağıda)
  dailySnapshot.ts            – günlük fiyat geçmişini Redis'te okuma/yazma
  flights/
    provider.ts               – provider-agnostic arayüz (FlightProvider)
    google-flights.ts          – Google Flights'a özel implementasyon (izole)
    normalize.ts               – Google'ın gömülü sayfa verisini parse etme
    cache.ts                   – basit in-memory cache (Vercel'de kalıcı değil)
    index.ts                   – FLIGHT_PROVIDER env değişkenine göre provider seçimi
app/
  page.tsx                  – ana sayfa (server component): günlük fırsat kartları + arama formu
  api/search/route.ts         – manuel arama uç noktası (app.js'in çağırdığı, canlı Google sorgusu)
  api/daily-top/route.ts      – en ucuz 4 günlük fırsat (Redis'ten, canlı sorgu yok)
  api/cron/daily-snapshot/    – Vercel Cron her gün 09:00 İstanbul'da bunu tetikler
  api/feasibility/route.ts    – manuel veri-erişimi doğrulama/debug uç noktası
public/
  app.js                     – arama formunun tüm etkileşimi (vanilla JS, DOM API)
  styles.css                 – fırsat kartları için Pico.css üzerine ek stil
```

Google Flights'ın resmi bir API'si yok. Bu uygulama, Google'ın herkese açık
`google.com/travel/flights` arama sayfasını sunucu tarafında (tarayıcıdan
değil) çekip sayfaya gömülü `AF_initDataCallback({key: 'ds:1', ...})` JS
verisini okuyor — yaklaşım [MarsLuay/CheapestFlightPicker](https://github.com/MarsLuay/CheapestFlightPicker/tree/main/docs)
projesinden referans alınmıştır. Bu resmi olmayan bir yöntem olduğu için
tamamı `lib/flights/google-flights.ts` ve `lib/flights/normalize.ts` içinde
izole edilmiştir; uygulamanın geri kalanı yalnızca `FlightProvider`
arayüzünü bilir.

### Ana sayfa hiç boş görünmez

`app/page.tsx` bir server component: `/api/daily-top` verisini (Redis'ten,
canlı Google sorgusu olmadan) doğrudan sunucu tarafında okuyup ilk HTML'e
gömer. Sayfa hiçbir JS çalışmadan bile dolu gelir. Manuel arama formu
(`public/app.js`) sadece kullanıcı "Ucuz Uçuşları Bul"a tıklayınca canlı
`/api/search` sorgusu atar — hydration ile çakışma riski olmadan, çünkü
tüm DOM değişiklikleri kullanıcı etkileşiminden sonra olur.

### Günlük fırsatlar ve ortalama fiyat formülü

Her gün 09:00'da (İstanbul saati) `api/cron/daily-snapshot` tetiklenir,
5 destinasyonun **yarın** tarihi için en ucuz fiyatı bulur ve Redis'e yazar.

Site kendi kendini besler: Redis'te **yarın** tarihine ait veri yoksa
(henüz hiç cron çalışmadıysa veya kayıtlı veri bayatladıysa) sayfa o anda
canlı arama yapar, sonucu gösterir ve Redis'e yazar (`lib/dailyTop.ts`).
Yani ilk cron'u veya kurulumu beklemeden site çalışır — sadece o ilk
istek yavaştır, sonraki ziyaretçiler hızlı yolu kullanır. Bayat veriyi
"Yarın" başlığı altında göstermek yanlış olacağı için tarih eşleşmesi
şart koşulur.

Google'ın "normalden %X ucuz" rozetinin arkasındaki gerçek algoritmasına
erişimimiz yok, bu yüzden kendi geçmişimizi biriktiriyoruz:

- **Baz fiyat (ortalama):** o destinasyon için son 30 günlük "yarın" fiyat
  gözleminin **medyanı** (`lib/pricing.ts`). Medyan tercih edildi çünkü tek
  seferlik bir fiyat sıçraması veya geçici bir hata, ortalamayı aritmetik
  ortalamadan daha az çarpıtır.
- **İndirim yüzdesi:** `(1 - bugünkü_fiyat / medyan) × 100`, tam sayıya
  yuvarlanmış.
- **En az 5 günlük veri** birikmeden rozet gösterilmez — aksi halde uydurma
  bir yüzde göstermiş oluruz. Bu durumda kart sadece fiyatı gösterir.

Ana sayfadaki "Yarın için en ucuz fırsatlar" bölümü, tüm destinasyonlar
arasından en ucuz 4'ünü gösterir (`app/api/daily-top/route.ts`).

### Cache

`lib/flights/cache.ts`, canlı arama (`/api/search`) için serverless
fonksiyonun modül kapsamında yaşayan basit bir `Map`'tir — Vercel'de
**kalıcı değildir**, sadece aynı sıcak instance'a düşen tekrar isteklerde
işe yarar. Günlük fırsatlar bundan ayrı, Redis'te kalıcı olarak tutulur
(`lib/dailySnapshot.ts`).

## Geliştirme

```bash
npm install
cp .env.example .env.local
npm run dev
```

Redis olmadan da çalışır: `/api/daily-top` ve ana sayfadaki günlük
fırsatlar bölümü boş veriye düşer ("Fırsatlar hazırlanıyor…" mesajı
gösterilir), hata vermez.

## Deploy (Vercel)

1. Bu repoyu GitHub'da Vercel'e bağlayın (Vercel dashboard → Add New Project
   → bu repoyu seçin, branch: `main`) ya da Vercel CLI ile: `npx vercel --prod`
2. **Upstash Redis ekleyin** (site Redis'siz de çalışır — her istekte canlı
   arama yapar, sadece yavaş olur ve "normalden %X ucuz" rozeti için gereken
   fiyat geçmişi birikmez):
   Vercel dashboard → projeniz → Storage → Marketplace Database Providers →
   "Upstash for Redis" → oluştur ve projeye bağla. Env değişkenleri otomatik
   eklenir, elle girmeyin. Vercel bağlama şekline göre iki farklı isimlendirme
   kullanabiliyor — uygulama ikisini de okur (`lib/redis.ts`):
   `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` veya
   `KV_REST_API_URL`+`KV_REST_API_TOKEN`.

   Bağlantının gerçekten kurulduğunu `/api/daily-top` çıktısından
   doğrulayabilirsiniz: `storage.configured` `true` olmalı ve ilk cron/
   ziyaretten sonra `source` `"stored"` dönmelidir. `source` sürekli
   `"live"` kalıyorsa veri kaydedilmiyordur.

   Listede beş destinasyonun tamamı yoksa sebebi aynı yanıttaki `missing`
   alanında yazar (ör. Google'ın o rota için döndürdüğü hata). Boş liste
   sessizce kısalmaz.
3. **CRON_SECRET ekleyin**: Project Settings → Environment Variables →
   `CRON_SECRET` = rastgele bir string. `vercel.json`'daki cron zaten
   `/api/cron/daily-snapshot`'ı her gün 06:00 UTC'de (09:00 İstanbul)
   otomatik tetikler; bu secret, o uç noktayı başkalarının tetiklemesini
   engeller.
4. Deploy sonrası test:
   - `/api/feasibility?origin=IST&destination=FCO&date=2026-09-18` — tekil veri doğrulama
   - İlk veriyi 09:00'ı beklemeden hemen üretmek için (CRON_SECRET ile korunuyor,
     bu yüzden tarayıcıdan değil, header ile çağırmak gerekir):
     ```bash
     curl -H "Authorization: Bearer <CRON_SECRET>" https://<deploy-url>/api/cron/daily-snapshot
     ```
   - `/` — günlük fırsatlar + tam arama arayüzü

Vercel Hobby planında cron job'lar günde bir kez çalışacak şekilde
sınırlıdır — tasarım zaten buna uygun (günde 1 kez, 09:00).
