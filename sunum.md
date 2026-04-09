# Yapı Market — Usta Müşteri Tahmin Projesi
### Gözetimli Öğrenme ile Müşteri Segmentasyonu

**Ders:** İstatistik / Makine Öğrenmesine Giriş

---

## İçerik

1. Problem: Ne yapmaya çalışıyoruz?
2. Veri: Elimizde ne var?
3. Özellik Mühendisliği: Tablodan sayıya
4. Modeller: Karar Ağacı ve Rastgele Orman
5. Doğru Ölçüm: Train/Test Ayrımı
6. Sonuçlar

---

## 1. Problem

**Soru:** Bu müşteri usta mı, bireysel mi? Hangi tür usta?

> Bir müşteri her ay düzenli olarak sabah saatlerinde büyük miktarda klima + montaj seti alıyorsa büyük ihtimalle bir **klima ustası**dır.

Bunu elle bulmak yerine makine öğrenmesiyle otomatikleştirmek istiyoruz.

**Neden önemli?**
- Usta müşterilere özel fiyat sunmak
- Doğru ürün önerileri
- Müşteri segmentasyonunu otomatikleştirmek

---

## 2. Veri — Tablolar ve İlişkiler

Dört tablo var, hepsi birbirine bağlı:

```
kategori          subkategori              product
─────────         ───────────────          ─────────────────────
K1 Isıtma    ←── SK1 klima           ←──  P001 Split Klima 9000 BTU
K2 Elektrik  ←── SK2 kombi               P002 Split Klima 12000 BTU
K3 Ahşap     ←── SK3 radyatorler         ...
              ── SK4 kablolar
              ...

customer ──── transactions ──── product
  (kim?)       (ne zaman?)       (ne?)
```

**Temel veri:**
- 50 müşteri — 7 farklı usta tipi
- 45 ürün — 3 ana, 9 alt kategori
- 623 işlem — gerçekçi alışveriş desenleriyle üretilmiş

---

## 2. Veri — 7 Müşteri Tipi

| Usta Tipi | Alışveriş Davranışı |
|---|---|
| klima-ustasi | İşlemlerin %70'i klima ürünleri |
| kombi-ustasi | İşlemlerin %65'i kombi ürünleri |
| elektrikci | Kablo + priz + sigorta karışımı |
| boyaci | İşlemlerin %90'ı boya ürünleri |
| seramik-ustasi | İşlemlerin %85'i seramik ürünleri |
| marangoz | İşlemlerin %85'i ahşap ürünleri |
| bireysel | Karma, küçük miktarlarda |

Ek sinyal: **ustalar sabah 07–10'da, haftaiçi gelir.** Bireysel müşteriler akşam ve hafta sonu.

---

## 3. Özellik Mühendisliği

**Problem:** Model ham tabloları okuyamaz. Her müşteri için tek bir sayı satırı üretmemiz lazım.

```
Önce:
  C001, P004, 3 adet, 1350 TL, 2024-03-15

Sonra (43 özellik):
  C001 | subkat_klima=42000 | klima_orani=0.97 | sabah_orani=0.82 | ...
```

**Özellik grupları:**

| Grup | Örnek Sütunlar |
|---|---|
| Ana kategori harcama | `harcama_K1`, `harcama_K2`, `harcama_K3` |
| Alt kategori harcama | `subkat_klima`, `subkat_kombi`, `subkat_kablolar`… |
| Uzmanlaşma oranları | `klima_orani`, `boya_orani`, `seramik_orani`… |
| Miktar sinyali | `ort_adet`, `toplu_alim_orani` |
| Sepet kompozisyon | `klima_set_orani`, `elektrik_komple_orani`… |
| Düzenlilik | `duzenlilik_skoru`, `aktif_ay_sayisi` |
| Zaman sinyali | `sabah_alisveris_orani`, `haftaici_alisveris_orani` |
| Profesyonel sinyal | `profesyonel_marka_orani`, `buyuk_ambalaj_orani` |

---

## 3. Özellik Mühendisliği — Subkategori Pivot

En güçlü sinyal burada. Her müşteri × alt kategori için toplam harcama:

```python
ig.pivot_table(
    index="customer_id",
    columns="subkategori_slug",
    values="toplam_tutar",
    aggfunc="sum",
    fill_value=0
)
```

```
              subkat_klima  subkat_kombi  subkat_kablolar  subkat_boya
C001 (klima)     42.000           0              150            0
C008 (kombi)          0       54.000               0            0
C022 (elekt.)         0            0            1.920            0
C035 (boyacı)         0            0                0        8.750
```

Her usta tipi kendi sütununda öne çıkıyor — bu modelin temel gücü.

---

## 3. Özellik Mühendisliği — Uzmanlaşma Oranı

**Problem:** İki klima ustası var ama biri 3x daha fazla harcıyor.  
Mutlak tutar değil, **oran** karşılaştırılabilir:

```python
klima_orani = subkat_klima / toplam_harcama
```

| Usta Tipi | klima_orani | kombi_orani | boya_orani | seramik_orani | ahsap_orani |
|---|---|---|---|---|---|
| klima-ustasi | **0.97** | 0.00 | 0.00 | 0.00 | 0.00 |
| kombi-ustasi | 0.12 | **0.84** | 0.00 | 0.00 | 0.00 |
| boyaci | 0.00 | 0.00 | **0.95** | 0.00 | 0.05 |
| seramik-ustasi | 0.00 | 0.00 | 0.01 | **0.97** | 0.02 |
| marangoz | 0.00 | 0.00 | 0.03 | 0.01 | **0.96** |
| bireysel | 0.16 | 0.03 | 0.19 | 0.05 | 0.37 |

Her usta tipi bir köşeye oturuyor. Model bu ayrımı çok kolay öğreniyor.

---

## 3. Özellik Mühendisliği — Neden Ana Kategori Yetmez?

K3 altında **üç farklı usta tipi** var:

```
K3 — Ahşap ve İnşaat
    ├── SK7  boya        → boyaci
    ├── SK8  seramik     → seramik-ustasi
    └── SK9  ahsaplar    → marangoz
```

Eğer sadece `harcama_K3` kullansaydık, bu üçü birbirinden ayırt edilemezdi.  
Alt kategori olmadan model K3 müşterileri için tahmin üretemez.

**İki kademeli sinyal:**
- Ana kategori → hangi sektörde? (geniş filtre)
- Alt kategori → tam olarak kim? (ayırt edici sinyal)

---

## 4. Modeller

### Karar Ağacı (Decision Tree)

İnsan gibi düşünür — "eğer şuysa, öyleyse":

```
subkat_klima > 5.000 TL mi?
├── EVET → klima_orani > 0.80 mi?
│          ├── EVET → KLİMA USTASI ✓
│          └── HAYIR → KOMBİ USTASI
└── HAYIR → subkat_boya > 3.000 TL mi?
            ├── EVET → BOYACI ✓
            └── HAYIR → ...
```

Avantaj: Anlaşılır, görselleştirilebilir.  
Dezavantaj: Veriye fazla uyabilir (overfitting).

---

## 4. Modeller

### Rastgele Orman (Random Forest)

100 farklı karar ağacı eğitilir, her biri rastgele özellik ve veri alt kümesiyle.  
Tahmin: ağaçların oylaması.

```
Ağaç 1: KLİMA USTASI
Ağaç 2: KLİMA USTASI
Ağaç 3: KOMBİ USTASI
...
Ağaç 100: KLİMA USTASI
→ Sonuç: KLİMA USTASI (çoğunluk)
```

Tek ağaca göre çok daha kararlı ve genellenebilir.  
Ayrıca hangi özelliklerin önemli olduğunu söyler → **Feature Importance**.

---

## 5. Doğru Ölçüm — Train/Test Ayrımı

**Sınav benzetmesi:** Öğrenciye soruları önceden vermek sınav değildir.

```
Tüm veri (50 müşteri)
├── Eğitim seti — %80 (40 müşteri) → model buradan öğrenir
└── Test seti   — %20 (10 müşteri) → model hiç görmemiştir ← gerçek ölçüm
```

**Neden kritik?**

Model eğitim verisini ezberleyebilir. Eğitim seti üzerinde %100 doğruluk görürsünüz ama gerçek müşterilerde tutmaz.

> Test seti doğruluğu = modelin gerçekte ne kadar iyi olduğu

Bu projede: test seti doğruluğu = **%100** — veri sentetik ve desenler çok belirgin olduğu için model kolayca öğreniyor. Gerçek verilerle bu kadar temiz ayrışma beklenmez.

---

## 5. Doğru Ölçüm — Öğrenme Eğrisi

Daha fazla veri ekleyince model nasıl değişiyor?

- X ekseni: eğitim setindeki müşteri sayısı
- Y ekseni: 5 katlı çapraz doğrulama doğruluğu

**Çapraz doğrulama (Cross-Validation):**  
Veri 5 parçaya bölünür. Her seferinde 1 parça test, 4 parça eğitim olur.  
5 sonucun ortalaması alınır → tek bir train/test bölünmesinden daha güvenilir.

> Prefix dilimleme (`veri[:n]`) yerine her seferinde karıştırılmış ve sınıf dengesi korunmuş örnekleme kullanılır.

---

## 6. Sonuçlar — Feature Importance

Random Forest hangi özelliklere baktı?

```
 1. [Alt Kategori ] subkat_klima                    0.18  ██████████████████
 2. [Oran         ] klima_orani                     0.15  ███████████████
 3. [Alt Kategori ] subkat_kombi                    0.12  ████████████
 4. [Alt Kategori ] subkat_boya-ve-boya-malzemeleri 0.10  ██████████
 5. [Oran         ] boya_orani                      0.09  █████████
 ...
```

**Gözlem:** İlk sıraları `subkat_*` ve `*_orani` sütunları tutuyor.  
Ana kategori (`harcama_K1` vb.) daha aşağıda — tek başına yeterince ayırt edici değil.

---

## 6. Sonuçlar — Dashboard

Streamlit ile interaktif görsel arayüz:

| Sekme | İçerik |
|---|---|
| **Genel Bakış** | KPI kartları, usta dağılımı, şehir haritası |
| **Müşteri Analizi** | Müşteri seç → radar grafik, güven skoru |
| **Model Performansı** | Karışıklık matrisi, öğrenme eğrisi |
| **Özellik Analizi** | Top-15 feature importance |

```bash
streamlit run dashboard.py
```

---

## Özet — Ne Öğrendik?

| Kavram | Nerede Kullandık? |
|---|---|
| `pivot_table` | Müşteri × subkategori harcama matrisi |
| Normalize veri modeli | kategori → subkategori → ürün FK zinciri |
| Uzmanlaşma oranı | Mutlak tutar yerine oran — farklı bütçeler karşılaştırılabilir |
| Sepet analizi | Aynı günde birlikte alınan ürünler |
| DRY ilkesi | `features.py` tek kaynak; diğer dosyalar import eder |
| Stratified split | Her sınıftan dengeli eğitim/test dağılımı |
| Veri sızıntısı riski | Eğitim seti üzerinde ölçüm neden yanıltıcıdır |
| Cross-validation | Tek bölünme yerine 5 katlı ortalama |
| Feature Importance | Modelin hangi sinyallere baktığı |

---

## Kaynaklar

- [scikit-learn — learning_curve](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.learning_curve.html)
- [scikit-learn — RandomForestClassifier](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html)
- [pandas — pivot_table](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.pivot_table.html)
- [Streamlit Dokümantasyonu](https://docs.streamlit.io/)
