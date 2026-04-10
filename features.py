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


# ── Veri yükleme ──────────────────────────────────────────────────────────────

def veri_yukle(data_dir="data"):
    """CSV dosyalarını yükler ve işlem tablosunu birleştirir."""
    customers     = pd.read_csv(f"{data_dir}/customer.csv")
    products      = pd.read_csv(f"{data_dir}/product.csv")
    transactions  = pd.read_csv(f"{data_dir}/transactions.csv")
    categories    = pd.read_csv(f"{data_dir}/kategori.csv")
    subcategories = pd.read_csv(f"{data_dir}/subkategori.csv")

    # subcat_id → slug ve cat_id'yi ürün tablosuna ekle
    products = products.merge(
        subcategories[["subcat_id", "slug", "cat_id"]],
        on="subcat_id", how="left"
    )

    transactions["date"] = pd.to_datetime(transactions["date"])

    tx = transactions.merge(
        products[["product_id", "cat_id", "slug", "brand_type", "package_type"]],
        on="product_id", how="left"
    )
    return customers, products, transactions, tx, categories, subcategories


# ── Özellik fonksiyonları ─────────────────────────────────────────────────────

def kategori_harcama(tx):
    """Ana kategori (K1/K2/K3) bazlı toplam harcama."""
    pivot = tx.pivot_table(index="customer_id", columns="cat_id",
                           values="total_amount", aggfunc="sum", fill_value=0)
    pivot.columns = [f"spend_{c}" for c in pivot.columns]
    return pivot.reset_index()


def subkategori_harcama(tx):
    """
    Alt kategori bazlı toplam harcama — asıl ayırt edici sinyal.
    Sütunlar: subcat_klima, subcat_kablolar, subcat_boya-ve-boya-malzemeleri …
    """
    pivot = tx.pivot_table(index="customer_id", columns="slug",
                           values="total_amount", aggfunc="sum", fill_value=0)
    pivot.columns = [f"subcat_{c}" for c in pivot.columns]
    return pivot.reset_index()


def temel_istatistik(transactions, tx):
    """İşlem sayısı, toplam harcama, ortalama tutar, alt kategori çeşitliliği."""
    df = transactions.groupby("customer_id").agg(
        transaction_count=("transaction_id", "count"),
        total_spend      =("total_amount",   "sum"),
        total_quantity   =("quantity",       "sum"),
    ).reset_index()
    df["avg_transaction"] = (df["total_spend"] / df["transaction_count"]).round(2)
    diversity = tx.groupby("customer_id")["slug"].nunique().rename("subcat_diversity")
    return df.merge(diversity, on="customer_id")


def miktar_sinyal(transactions):
    """Adet sinyalleri — ustalar toplu alır (quantity > 5)."""
    return transactions.groupby("customer_id").agg(
        avg_quantity=("quantity", "mean"),
        max_quantity=("quantity", "max"),
        bulk_rate   =("quantity", lambda x: round((x > 5).mean(), 3)),
    ).reset_index()


def sepet_kompozisyon(tx):
    """
    Aynı günde birlikte alınan alt kategoriler.
    - klima_set_rate       : klima alınan günlerde başka ürün de var mı?
    - kombi_radyator_rate  : kombi + radyatör aynı sepette
    - electric_set_rate    : en az 2 elektrik alt kategorisi aynı sepette
    - paint_set_rate       : boya içeren sepet oranı
    """
    g = tx.groupby(["customer_id", "date"])["slug"].apply(set).reset_index()
    g.columns = ["customer_id", "date", "subs"]

    ELEKTRIK = {"kablolar", "priz", "sigorta-kutusu"}
    g["klima_set"]     = g["subs"].apply(lambda x: int("klima" in x and len(x) > 1))
    g["kombi_rad_set"] = g["subs"].apply(lambda x: int("kombi" in x and "radyatorler" in x))
    g["electric_set"]  = g["subs"].apply(lambda x: int(len(ELEKTRIK & x) >= 2))
    g["paint_set"]     = g["subs"].apply(lambda x: int("boya-ve-boya-malzemeleri" in x))
    g["basket_size"]   = g["subs"].apply(len)

    return g.groupby("customer_id").agg(
        klima_set_rate      =("klima_set",     "mean"),
        kombi_radyator_rate =("kombi_rad_set",  "mean"),
        electric_set_rate   =("electric_set",   "mean"),
        paint_set_rate      =("paint_set",      "mean"),
        avg_basket_size     =("basket_size",    "mean"),
    ).reset_index().round(3)


def duzenlilik(transactions):
    """
    Alışveriş düzenliliği.
    regularity_score = std(aralıklar) / mean(aralıklar) → küçükse düzenli → usta
    """
    rows = []
    for cid, grp in transactions.groupby("customer_id"):
        dates     = sorted(grp["date"].unique())
        active_mo = grp["date"].dt.to_period("M").nunique()
        if len(dates) > 1:
            gaps = [(dates[i+1] - dates[i]).days for i in range(len(dates) - 1)]
            avg_gap = round(np.mean(gaps), 1)
            reg     = round(np.std(gaps) / (np.mean(gaps) + 1), 3)
        else:
            avg_gap = 0; reg = 0
        rows.append({
            "customer_id"        : cid,
            "avg_purchase_interval": avg_gap,
            "regularity_score"   : reg,
            "active_months"      : active_mo,
            "total_purchase_days": len(dates),
        })
    return pd.DataFrame(rows)


def zaman_sinyali(transactions):
    """
    Saat ve gün sinyalleri.
    Ustalar sabah (07–10) ve haftaiçi gelir; bireysel akşam/hafta sonu.
    """
    df = transactions.copy()
    df["weekday"] = df["date"].dt.dayofweek < 5
    df["morning"] = df["hour"] < 11
    return df.groupby("customer_id").agg(
        weekday_rate=("weekday", lambda x: round(x.mean(), 3)),
        morning_rate=("morning", lambda x: round(x.mean(), 3)),
    ).reset_index()


def profesyonel_sinyal(tx):
    """Profesyonel marka ve büyük ambalaj tercihi — usta sinyal."""
    return tx.groupby("customer_id").agg(
        pro_brand_rate   =("brand_type",   lambda x: round((x == "profesyonel").mean(), 3)),
        large_package_rate=("package_type", lambda x: round((x == "buyuk").mean(), 3)),
    ).reset_index()


def uzmanlik_oranlari(df):
    """
    Her alt kategorinin toplam harcamaya oranı + uzmanlık skoru.
    Mutlak tutardan daha güvenilir: farklı bütçeli ustalar karşılaştırılabilir.
    """
    t = df["total_spend"].replace(0, 1)

    SUBCAT_RATIOS = {
        "klima_ratio"   : "subcat_klima",
        "kombi_ratio"   : "subcat_kombi",
        "radyator_ratio": "subcat_radyatorler",
        "kablo_ratio"   : "subcat_kablolar",
        "priz_ratio"    : "subcat_priz",
        "sigorta_ratio" : "subcat_sigorta-kutusu",
        "boya_ratio"    : "subcat_boya-ve-boya-malzemeleri",
        "seramik_ratio" : "subcat_seramik-ve-fayans",
        "ahsap_ratio"   : "subcat_ahsaplar",
    }
    result = pd.DataFrame({"customer_id": df["customer_id"]})
    for new_col, src_col in SUBCAT_RATIOS.items():
        result[new_col] = df.get(src_col, 0) / t

    subcat_cols = [c for c in df.columns if c.startswith("subcat_")]
    result["expertise_score"] = df[subcat_cols].max(axis=1) / t

    return result.round(3)


# ── Ana pipeline ──────────────────────────────────────────────────────────────

def ozellik_matrisi_olustur(customers, transactions, tx):
    """
    Tüm özellik fonksiyonlarını çalıştırır, tek bir müşteri × özellik
    tablosunda birleştirir ve etiketleri ekler.

    Dönüş:
        df               — tam özellik matrisi (etiket dahil)
        feature_cols     — modele verilecek sütun listesi
    """
    df = kategori_harcama(tx)
    for table in [
        subkategori_harcama(tx),
        temel_istatistik(transactions, tx),
        miktar_sinyal(transactions),
        sepet_kompozisyon(tx),
        duzenlilik(transactions),
        zaman_sinyali(transactions),
        profesyonel_sinyal(tx),
    ]:
        df = df.merge(table, on="customer_id")

    ratios = uzmanlik_oranlari(df)
    df = df.merge(ratios, on="customer_id")
    df = df.merge(customers[["customer_id", "label"]], on="customer_id")

    feature_cols = [c for c in df.columns if c not in ["customer_id", "label"]]
    return df, feature_cols


def model_egit(df, feature_cols, test_size=0.20, random_state=42):
    """
    LabelEncoder + Karar Ağacı + Rastgele Orman eğitir.

    Dönüş: le, ro, ka, X, X_tr, X_te, y_tr, y_te, pred_df
    """
    le = LabelEncoder()
    X  = df[feature_cols].values
    y  = le.fit_transform(df["label"])

    # Hangi satırların test setine düştüğünü indeks üzerinden takip et.
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
    preds     = ro.predict(X)
    proba     = ro.predict_proba(X)

    pred_df = df[["customer_id", "label"]].copy()
    pred_df["predicted_type"] = le.inverse_transform(preds)
    pred_df["confidence"]     = proba.max(axis=1).round(2)
    pred_df["correct"]        = pred_df["predicted_type"] == pred_df["label"]

    # split sütunu: hangi müşteri eğitimde görüldü, hangisi görülmedi
    split         = np.full(n, "train", dtype=object)
    split[idx_te] = "test"
    pred_df["split"] = split

    return le, ro, ka, X, X_tr, X_te, y_tr, y_te, pred_df
