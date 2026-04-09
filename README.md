# Yapı Market — Usta Müşteri Tahmin Projesi

**Ders:** İstatistik / Makine Öğrenmesine Giriş  
**Konu:** Gözetimli Öğrenme ile Müşteri Segmentasyonu  
**Kullanılan Araçlar:** Python · pandas · scikit-learn · Streamlit · Plotly

---

## Projenin Amacı

Bir yapı market şirketinin müşteri alışveriş verilerine bakarak hangi müşterilerin **usta** (klima ustası, kombi ustası, elektrikçi, boyacı vb.) olduğunu tahmin etmeye çalışıyoruz.

> **Temel fikir:** Bir müşteri düzenli olarak büyük miktarda klima + montaj seti alıyorsa büyük ihtimalle bir **klima ustası**dır. Bunu makine öğrenmesiyle otomatik bulmak istiyoruz.

Bu tür tahminler şirkete şunu sağlar:
- Usta müşterilere özel fiyat veya indirim sunmak
- Doğru kişilere doğru ürünleri önermek (tavsiye sistemi)
- Müşteri segmentasyonunu otomatikleştirmek

---

## Kategori Yapısı

Proje gerçek bir yapı marketi ürün taksonomisini kullanır. 3 ana kategori ve her birinin altında 3 alt kategori bulunur.

```
K1 — Isıtma ve Soğutma
    ├── SK1  klima          → Split klima üniteleri, montaj seti, bakım spreyi
    ├── SK2  kombi          → Yoğuşmalı kombiler, bağlantı setleri, filtre
    └── SK3  radyatorler    → Panel radyatörler, termostatik vana, purjör

K2 — Aydınlatma ve Elektrik
    ├── SK4  kablolar       → NYM/NYA/Flex kablo, kablo kanalı, makaron
    ├── SK5  priz           → Priz/anahtar setleri, buat, çerçeve, akıllı priz
    └── SK6  sigorta-kutusu → Sigorta otomatiği, kaçak akım rölesi, tablo

K3 — Ahşap ve İnşaat
    ├── SK7  boya-ve-boya-malzemeleri → İç/dış cephe boyası, astar, rulo seti
    ├── SK8  seramik-ve-fayans        → Yer/duvar seramiği, yapıştırıcı, derz
    └── SK9  ahsaplar                 → Sunta, MDF, masif panel, kereste, OSB
```

---

## Proje Dosya Yapısı

```
cok-basit-ai/
├── data/
│   ├── kategori.csv      ← 3 ana kategori (K1, K2, K3)
│   ├── subkategori.csv   ← 9 alt kategori (SK1–SK9), kategori FK'sı ile
│   ├── product.csv       ← 45 ürün, subkategori_id ile bağlı
│   ├── customer.csv      ← 50 müşteri, 7 usta tipi
│   └── transactions.csv  ← 600+ gerçekçi işlem
├── features.py           ← Tek kaynak: özellik mühendisliği + model eğitimi
├── analiz.py             ← Makine öğrenmesi scripti (features.py'den import eder)
├── dashboard.py          ← Streamlit görsel dashboard (features.py'den import eder)
└── requirements.txt      ← Gerekli Python kütüphaneleri
```

> `data/tahmin_sonuclari.csv` ve `data/analiz_grafikleri.png` `analiz.py` çalıştırılınca otomatik oluşur; repoda tutulmaz.

---

## Veri Modeli

```
kategori.csv          subkategori.csv              product.csv
──────────────        ───────────────────          ─────────────────────
kategori_id  ←──FK──  kategori_id                  product_id
kategori_adi           subkategori_id  ←──FK──      subkategori_id
                       subkategori_slug              urun_adi
                       subkategori_adi               fiyat, marka
                                                     marka_tipi, ambalaj_tipi

customer.csv ──── transactions.csv ──── product.csv
   (kim?)          (ne zaman, kaç?)        (ne?)
```

`features.py`'deki `veri_yukle()` fonksiyonu `subkategori_id → slug + kategori_id` join'ini otomatik yapar; pipeline'ın geri kalanı slug'ı doğrudan kullanır.

---

## Veri Seti Açıklamaları

### `kategori.csv`

| Sütun | Açıklama |
|-------|----------|
| `kategori_id` | K1, K2, K3 |
| `kategori_adi` | Kategorinin adı |
| `ana_kategori_slug` | URL slug'ı |
| `aciklama` | Kategori içeriği |

### `subkategori.csv`

| Sütun | Açıklama |
|-------|----------|
| `subkategori_id` | SK1–SK9 |
| `subkategori_slug` | URL slug'ı (klima, kablolar…) |
| `subkategori_adi` | Okunabilir ad |
| `kategori_id` | Bağlı ana kategori (FK) |

### `product.csv`

| Sütun | Açıklama |
|-------|----------|
| `product_id` | P001–P045 |
| `urun_adi` | Gerçek ürün adı |
| `subkategori_id` | Bağlı alt kategori (FK) |
| `fiyat` | Birim fiyat (TL) |
| `marka` | Daikin, Bosch, Prysmian, Kale… |
| `marka_tipi` | `profesyonel` / `ekonomik` |
| `ambalaj_tipi` | `buyuk` / `kucuk` |

**Örnek ürünler:**

| Ürün | Subkategori | Fiyat |
|------|-------------|-------|
| Split Klima 12000 BTU | SK1 — klima | 11.000 ₺ |
| Kombi 24kW Yoğuşmalı | SK2 — kombi | 18.000 ₺ |
| Panel Radyatör 600x1000 | SK3 — radyatorler | 1.200 ₺ |
| NYM Kablo 3x2.5mm 100m | SK4 — kablolar | 320 ₺ |
| Sigorta Otomatiği 16A | SK6 — sigorta-kutusu | 45 ₺ |
| İç Cephe Boyası 15L | SK7 — boya | 450 ₺ |
| Yer Seramiği 60x60 m² | SK8 — seramik | 85 ₺ |
| MDF Levha 210x280cm | SK9 — ahsaplar | 240 ₺ |

### `customer.csv`

| Sütun | Açıklama |
|-------|----------|
| `customer_id` | C001–C050 |
| `musteri_segmenti` | `Usta` / `Bireysel` |
| `gercek_etiket` | Gerçek usta tipi (modelin öğreneceği etiket) |

**7 müşteri tipi ve dağılım:**

| Usta Tipi | Müşteri Sayısı | Uzmanlık Alanı |
|-----------|---------------|----------------|
| klima-ustasi | 7 | SK1 (%70) |
| kombi-ustasi | 7 | SK2 (%65) |
| elektrikci | 7 | SK4 + SK5 + SK6 |
| boyaci | 8 | SK7 (%90) |
| seramik-ustasi | 7 | SK8 (%85) |
| marangoz | 7 | SK9 (%85) |
| bireysel | 7 | Karma alışveriş |

### `transactions.csv`

| Sütun | Açıklama |
|-------|----------|
| `transaction_id` | T0001–T0600+ |
| `customer_id` | Kim aldı? |
| `product_id` | Ne aldı? |
| `adet` | Kaç adet? |
| `toplam_tutar` | Toplam TL |
| `islem_tarihi` | Tarih |
| `islem_saati` | Saat (ustalar 07–10, bireysel 11–19) |

---

## Kod Mimarisi

```
features.py          ← Tek kaynak: veri_yukle(), ozellik_matrisi_olustur(), model_egit()
    ↑                    Şema veya iş kuralı değişikliği yalnızca burada yapılır.
    ├── analiz.py    ← import features → çalıştır → CSV + grafik yaz
    └── dashboard.py ← import features → @st.cache_data → Streamlit'e sun
```

### `features.py` fonksiyonları

| Fonksiyon | Açıklama |
|-----------|----------|
| `veri_yukle()` | 5 CSV'yi okur, subkategori join'ini yapar, `islemler_genis`'i üretir |
| `kategori_harcama()` | K1/K2/K3 ana kategori pivot → `harcama_K1`, `harcama_K2`, `harcama_K3` |
| `subkategori_harcama()` | 9 alt kategori pivot → `subkat_klima`, `subkat_kombi`, … |
| `temel_istatistik()` | İşlem sayısı, toplam harcama, ortalama tutar, alt kategori çeşitliliği |
| `miktar_sinyal()` | Adet ortalaması, maksimumu, toplu alım oranı (adet > 5) |
| `sepet_kompozisyon()` | Aynı günde birlikte alınan alt kategoriler |
| `duzenlilik()` | Alışveriş aralığı istatistikleri, aktif ay sayısı |
| `zaman_sinyali()` | Sabah (<11) ve haftaiçi alışveriş oranı |
| `profesyonel_sinyal()` | Profesyonel marka ve büyük ambalaj tercihi |
| `uzmanlik_oranlari()` | Alt kategori harcaması / toplam harcama oranları |
| `ozellik_matrisi_olustur()` | Tüm fonksiyonları çalıştırır, tek tabloda birleştirir |
| `model_egit()` | LabelEncoder + Karar Ağacı + Rastgele Orman eğitir |

---

## Özellik Mühendisliği (43 Özellik)

| Grup | Özellikler | Açıklama |
|------|-----------|----------|
| **Ana Kategori Harcama** | `harcama_K1`, `harcama_K2`, `harcama_K3` | Her ana kategoriden toplam harcama |
| **Alt Kategori Harcama** | `subkat_klima`, `subkat_kombi`, `subkat_kablolar`… | 9 alt kategoriden harcama — asıl ayırt edici sinyal |
| **Uzmanlaşma Oranları** | `klima_orani`, `boya_orani`, `seramik_orani`… | Alt kategori harcaması / toplam harcama |
| **Temel İstatistik** | `islem_sayisi`, `toplam_harcama`, `ort_islem_tutari` | Alışveriş yoğunluğu |
| **Miktar Sinyali** | `ort_adet`, `max_adet`, `toplu_alim_orani` | Ustalar toplu alır |
| **Sepet Kompozisyon** | `klima_set_orani`, `elektrik_komple_orani`… | Aynı günde birlikte alınan alt kategoriler |
| **Düzenlilik** | `duzenlilik_skoru`, `aktif_ay_sayisi` | Ustalar proje proje düzenli gelir |
| **Zaman Sinyali** | `sabah_alisveris_orani`, `haftaici_alisveris_orani` | Ustalar sabah/haftaiçi gelir |
| **Profesyonel Sinyal** | `profesyonel_marka_orani`, `buyuk_ambalaj_orani` | Usta Bosch/Daikin tercih eder, büyük ambalaj alır |

---

## Makine Öğrenmesi Modelleri

### Karar Ağacı (Decision Tree)

```
subkat_klima > 5000 TL mı?
├── EVET → klima_orani > 0.80 mı?
│          ├── EVET → "KLİMA USTASI"
│          └── HAYIR → "KOMBİ USTASI"
└── HAYIR → subkat_boya > 3000 TL mı?
            ├── EVET → "BOYACI"
            └── HAYIR → ...
```

### Rastgele Orman (Random Forest)

100 farklı karar ağacı eğitilir, oylama ile tahmin üretilir. Tek ağaca göre çok daha kararlı.

### Eğitim / Test Ayrımı

| Küme | Oran | Amaç |
|------|------|-------|
| Eğitim | %80 (40 müşteri) | Model buradan öğrenir |
| Test | %20 (10 müşteri) | Hiç görmediği veri ile ölçüm |

`tahmin_df`'deki `split` sütunu her müşteriyi `"egitim"` veya `"test"` olarak işaretler. Doğruluk ve güven skoru metrikleri yalnızca `split=="test"` satırları üzerinden hesaplanır; eğitim setinde geri bakarak elde edilen şişirilmiş rakamlar raporlanmaz.

---

## Kurulum ve Çalıştırma

### 1. Gerekli kütüphaneleri yükle
```bash
pip install -r requirements.txt
```

### 2. Makine öğrenmesi analizini çalıştır
```bash
python analiz.py
```
Modeli eğitir, tahminleri yapar ve `data/tahmin_sonuclari.csv` + `data/analiz_grafikleri.png` oluşturur.

### 3. Dashboard'u başlat
```bash
streamlit run dashboard.py
```
Tarayıcıda `http://localhost:8501` adresine git.

---

## Model Değerlendirme

### Uzmanlaşma Oranı Tablosu

Modelin neden bu kadar iyi çalıştığını şu tablo gösterir:

| Usta Tipi | klima | kombi | boya | seramik | ahşap | kablo |
|-----------|-------|-------|------|---------|-------|-------|
| klima-ustasi | **0.97** | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| kombi-ustasi | 0.12 | **0.84** | 0.00 | 0.00 | 0.00 | 0.00 |
| boyaci | 0.00 | 0.00 | **0.95** | 0.00 | 0.05 | 0.00 |
| seramik-ustasi | 0.00 | 0.00 | 0.01 | **0.97** | 0.02 | 0.00 |
| marangoz | 0.00 | 0.00 | 0.03 | 0.01 | **0.96** | 0.00 |
| elektrikci | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | **0.42** |
| bireysel | 0.16 | 0.03 | 0.19 | 0.05 | 0.37 | 0.05 |

Her usta tipi kendi alt kategorisine yoğunlaşmış — bu sinyal modelin temel gücüdür.

---

## Dashboard Kullanımı

Dashboard 4 sekmeden oluşur:

| Sekme | İçerik |
|-------|--------|
| **Genel Bakış** | KPI kartları, usta dağılımı, kategori harcama ısı haritası |
| **Müşteri Analizi** | Müşteri seç → radar grafik, tahmin, güven skoru |
| **Model Performansı** | Karışıklık matrisi, sınıflandırma raporu, öğrenme eğrisi |
| **Özellik Önemleri** | Top-15 özellik, renk kodlu (alt kategori / oran / diğer) |

---

## Öğrenilen Kavramlar

- [x] **Pandas merge & pivot_table** — tablo birleştirme ve özellik çıkarımı
- [x] **Normalize veri modeli** — kategori → subkategori → ürün FK zinciri
- [x] **DRY ilkesi** — `features.py` tek kaynak; `analiz.py` ve `dashboard.py` import eder
- [x] **İki kademeli özellik** — ana kategori (geniş sinyal) + alt kategori (ayırt edici)
- [x] **Uzmanlaşma oranı** — mutlak tutar yerine oran kullanımının avantajı
- [x] **Sepet analizi** — aynı günde birlikte alınan ürünler
- [x] **Zaman sinyalleri** — sabah/haftaiçi alışveriş davranışı
- [x] **Label Encoding** — metin etiketlerini sayıya çevirme
- [x] **Train/Test Split** — stratified örnekleme, indeks takibi ile split sütunu
- [x] **Veri sızıntısı riski** — eğitim seti üzerinde ölçüm neden yanıltıcıdır
- [x] **Karar Ağacı** ve **Rastgele Orman** modelleri
- [x] **Precision, Recall, F1-Score** metrikleri
- [x] **Karışıklık Matrisi** yorumlama
- [x] **Feature Importance** — modelin hangi özelliklere baktığı
- [x] **Streamlit** ile interaktif dashboard

---

## Kaynaklar

- [scikit-learn Dokümantasyonu](https://scikit-learn.org/stable/)
- [pandas Dokümantasyonu](https://pandas.pydata.org/docs/)
- [Streamlit Dokümantasyonu](https://docs.streamlit.io/)
- [scikit-learn — DecisionTreeClassifier](https://scikit-learn.org/stable/modules/generated/sklearn.tree.DecisionTreeClassifier.html)

---

*Tüm veriler eğitim amaçlı sentetik olarak üretilmiştir.*
