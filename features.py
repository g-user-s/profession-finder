# =============================================================
#  features.py — Tek kaynak özellik mühendisliği modülü
#
#  Hem analiz.py hem dashboard.py buradan import eder.
#  İş kuralı veya şema değişikliği yalnızca bu dosyada yapılır.
#
#  Kategori yapısı:
#    K1 — Isıtma ve Soğutma   : klima | kombi | radyatorler
#    K2 — Aydınlatma/Elektrik : kablolar | priz | sigorta-kutusu
#    K3 — Ahşap ve İnşaat     : boya-ve-boya-malzemeleri | seramik-ve-fayans | ahsaplar
# =============================================================

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report


# ── Veri yükleme ──────────────────────────────────────────────────────────────

def veri_yukle(data_dir="data"):
    """CSV dosyalarını yükler ve işlem tablosunu birleştirir."""
    musteriler    = pd.read_csv(f"{data_dir}/customer.csv")
    urunler       = pd.read_csv(f"{data_dir}/product.csv")
    islemler      = pd.read_csv(f"{data_dir}/transactions.csv")
    kategoriler   = pd.read_csv(f"{data_dir}/kategori.csv")
    subkategoriler = pd.read_csv(f"{data_dir}/subkategori.csv")

    # subkategori_id → slug ve kategori_id'yi ürün tablosuna ekle
    urunler = urunler.merge(
        subkategoriler[["subkategori_id", "subkategori_slug", "kategori_id"]],
        on="subkategori_id", how="left"
    )

    islemler["islem_tarihi"] = pd.to_datetime(islemler["islem_tarihi"])

    islemler_genis = islemler.merge(
        urunler[["product_id","kategori_id","subkategori_slug","marka_tipi","ambalaj_tipi"]],
        on="product_id", how="left"
    )
    return musteriler, urunler, islemler, islemler_genis, kategoriler, subkategoriler


# ── Özellik fonksiyonları ─────────────────────────────────────────────────────

def kategori_harcama(ig):
    """Ana kategori (K1/K2/K3) bazlı toplam harcama."""
    pivot = ig.pivot_table(index="customer_id", columns="kategori_id",
                           values="toplam_tutar", aggfunc="sum", fill_value=0)
    pivot.columns = [f"harcama_{c}" for c in pivot.columns]
    return pivot.reset_index()


def subkategori_harcama(ig):
    """
    Alt kategori bazlı toplam harcama — asıl ayırt edici sinyal.
    Sütunlar: subkat_klima, subkat_kablolar, subkat_boya-ve-boya-malzemeleri …
    """
    pivot = ig.pivot_table(index="customer_id", columns="subkategori_slug",
                           values="toplam_tutar", aggfunc="sum", fill_value=0)
    pivot.columns = [f"subkat_{c}" for c in pivot.columns]
    return pivot.reset_index()


def temel_istatistik(islemler, ig):
    """İşlem sayısı, toplam harcama, ortalama tutar, alt kategori çeşitliliği."""
    df = islemler.groupby("customer_id").agg(
        islem_sayisi   =("transaction_id", "count"),
        toplam_harcama =("toplam_tutar",   "sum"),
        toplam_adet    =("adet",           "sum"),
    ).reset_index()
    df["ort_islem_tutari"] = (df["toplam_harcama"] / df["islem_sayisi"]).round(2)
    ces = ig.groupby("customer_id")["subkategori_slug"].nunique().rename("subkategori_cesitliligi")
    return df.merge(ces, on="customer_id")


def miktar_sinyal(islemler):
    """Adet sinyalleri — ustalar toplu alır (adet > 5)."""
    return islemler.groupby("customer_id").agg(
        ort_adet        =("adet", "mean"),
        max_adet        =("adet", "max"),
        toplu_alim_orani=("adet", lambda x: round((x > 5).mean(), 3)),
    ).reset_index()


def sepet_kompozisyon(ig):
    """
    Aynı günde birlikte alınan alt kategoriler.
    - klima_set_orani       : klima alınan günlerde başka ürün de var mı?
    - kombi_radyator_orani  : kombi + radyatör aynı sepette
    - elektrik_komple_orani : en az 2 elektrik alt kategorisi aynı sepette
    - boya_odakli_orani     : boya içeren sepet oranı
    """
    g = ig.groupby(["customer_id","islem_tarihi"])["subkategori_slug"].apply(set).reset_index()
    g.columns = ["customer_id","islem_tarihi","subs"]

    ELEKTRIK = {"kablolar","priz","sigorta-kutusu"}
    g["klima_set"]           = g["subs"].apply(lambda x: int("klima" in x and len(x) > 1))
    g["kombi_radyator_set"]  = g["subs"].apply(lambda x: int("kombi" in x and "radyatorler" in x))
    g["elektrik_komple_set"] = g["subs"].apply(lambda x: int(len(ELEKTRIK & x) >= 2))
    g["boya_odakli_sepet"]   = g["subs"].apply(lambda x: int("boya-ve-boya-malzemeleri" in x))
    g["sepet_cesitlilik"]    = g["subs"].apply(len)

    return g.groupby("customer_id").agg(
        klima_set_orani       =("klima_set",          "mean"),
        kombi_radyator_orani  =("kombi_radyator_set",  "mean"),
        elektrik_komple_orani =("elektrik_komple_set", "mean"),
        boya_odakli_orani     =("boya_odakli_sepet",   "mean"),
        ort_sepet_cesitliligi =("sepet_cesitlilik",    "mean"),
    ).reset_index().round(3)


def duzenlilik(islemler):
    """
    Alışveriş düzenliliği.
    duzenlilik_skoru = std(aralıklar) / mean(aralıklar) → küçükse düzenli → usta
    """
    rows = []
    for cid, grp in islemler.groupby("customer_id"):
        tarihler = sorted(grp["islem_tarihi"].unique())
        aktif_ay = grp["islem_tarihi"].dt.to_period("M").nunique()
        if len(tarihler) > 1:
            farklar = [(tarihler[i+1]-tarihler[i]).days for i in range(len(tarihler)-1)]
            ort_ar = round(np.mean(farklar), 1)
            duz    = round(np.std(farklar) / (np.mean(farklar)+1), 3)
        else:
            ort_ar = 0; duz = 0
        rows.append({"customer_id": cid,
                     "ort_alisveris_araligi": ort_ar,
                     "duzenlilik_skoru":      duz,
                     "aktif_ay_sayisi":       aktif_ay,
                     "toplam_alisveris_gunu": len(tarihler)})
    return pd.DataFrame(rows)


def zaman_sinyali(islemler):
    """
    Saat ve gün sinyalleri.
    Ustalar sabah (07–10) ve haftaiçi gelir; bireysel akşam/hafta sonu.
    """
    df = islemler.copy()
    df["haftaici"] = df["islem_tarihi"].dt.dayofweek < 5
    df["sabah"]    = df["islem_saati"] < 11
    return df.groupby("customer_id").agg(
        haftaici_alisveris_orani=("haftaici", lambda x: round(x.mean(), 3)),
        sabah_alisveris_orani   =("sabah",    lambda x: round(x.mean(), 3)),
    ).reset_index()


def profesyonel_sinyal(ig):
    """Profesyonel marka ve büyük ambalaj tercihi — usta sinyal."""
    return ig.groupby("customer_id").agg(
        profesyonel_marka_orani=("marka_tipi",  lambda x: round((x=="profesyonel").mean(), 3)),
        buyuk_ambalaj_orani    =("ambalaj_tipi",lambda x: round((x=="buyuk").mean(), 3)),
    ).reset_index()


def uzmanlik_oranlari(df):
    """
    Her alt kategorinin toplam harcamaya oranı + uzmanlık skoru.
    Mutlak tutardan daha güvenilir: farklı bütçeli ustalar karşılaştırılabilir.
    """
    t = df["toplam_harcama"].replace(0, 1)

    SUBKAT_ORANLAR = {
        "klima_orani"   : "subkat_klima",
        "kombi_orani"   : "subkat_kombi",
        "radyator_orani": "subkat_radyatorler",
        "kablo_orani"   : "subkat_kablolar",
        "priz_orani"    : "subkat_priz",
        "sigorta_orani" : "subkat_sigorta-kutusu",
        "boya_orani"    : "subkat_boya-ve-boya-malzemeleri",
        "seramik_orani" : "subkat_seramik-ve-fayans",
        "ahsap_orani"   : "subkat_ahsaplar",
    }
    ozet = pd.DataFrame({"customer_id": df["customer_id"]})
    for yeni_col, kaynak_col in SUBKAT_ORANLAR.items():
        ozet[yeni_col] = df.get(kaynak_col, 0) / t

    subkat_cols = [c for c in df.columns if c.startswith("subkat_")]
    ozet["uzmanlik_skoru"] = df[subkat_cols].max(axis=1) / t

    return ozet.round(3)


# ── Ana pipeline ──────────────────────────────────────────────────────────────

def ozellik_matrisi_olustur(musteriler, islemler, islemler_genis):
    """
    Tüm özellik fonksiyonlarını çalıştırır, tek bir müşteri × özellik
    tablosunda birleştirir ve etiketleri ekler.

    Dönüş:
        df               — tam özellik matrisi (etiket dahil)
        ozellik_sutunlari — modele verilecek sütun listesi
    """
    df = kategori_harcama(islemler_genis)
    for tablo in [
        subkategori_harcama(islemler_genis),
        temel_istatistik(islemler, islemler_genis),
        miktar_sinyal(islemler),
        sepet_kompozisyon(islemler_genis),
        duzenlilik(islemler),
        zaman_sinyali(islemler),
        profesyonel_sinyal(islemler_genis),
    ]:
        df = df.merge(tablo, on="customer_id")

    oranlar = uzmanlik_oranlari(df)
    df = df.merge(oranlar, on="customer_id")
    df = df.merge(musteriler[["customer_id","gercek_etiket"]], on="customer_id")

    ozellik_sutunlari = [c for c in df.columns if c not in ["customer_id","gercek_etiket"]]
    return df, ozellik_sutunlari


def model_egit(df, ozellik_sutunlari, test_size=0.20, random_state=42):
    """
    LabelEncoder + Karar Ağacı + Rastgele Orman eğitir.

    Dönüş: le, ro, ka, X, X_tr, X_te, y_tr, y_te, tahmin_df
    """
    le = LabelEncoder()
    X  = df[ozellik_sutunlari].values
    y  = le.fit_transform(df["gercek_etiket"])

    # Hangi satırların test setine düştüğünü indeks üzerinden takip et.
    # train_test_split(X, y) çağrıldığında hangi müşterinin nerede olduğu
    # bilinemez; bu yüzden önce indeks dizisini böl.
    n   = len(df)
    idx = np.arange(n)
    idx_tr, idx_te = train_test_split(
        idx, test_size=test_size, random_state=random_state, stratify=y
    )
    X_tr, X_te = X[idx_tr], X[idx_te]
    y_tr, y_te = y[idx_tr], y[idx_te]

    ka = DecisionTreeClassifier(max_depth=6, min_samples_leaf=2, random_state=random_state)
    ka.fit(X_tr, y_tr)

    ro = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=random_state)
    ro.fit(X_tr, y_tr)

    # Tüm müşterileri tahminle — dashboard müşteri bazlı görünüm için gerekli.
    # Performans metrikleri için yalnızca split=="test" satırları kullanılmalı.
    tahmin   = ro.predict(X)
    olasilik = ro.predict_proba(X)

    tahmin_df = df[["customer_id","gercek_etiket"]].copy()
    tahmin_df["tahmin_usta_tipi"] = le.inverse_transform(tahmin)
    tahmin_df["guven_skoru"]      = olasilik.max(axis=1).round(2)
    tahmin_df["dogru_mu"]         = tahmin_df["tahmin_usta_tipi"] == tahmin_df["gercek_etiket"]

    # split sütunu: hangi müşteri eğitimde görüldü, hangisi görülmedi
    split         = np.full(n, "egitim", dtype=object)
    split[idx_te] = "test"
    tahmin_df["split"] = split

    return le, ro, ka, X, X_tr, X_te, y_tr, y_te, tahmin_df
