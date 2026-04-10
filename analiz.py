# =============================================================
#  USTA MUSTERI TAHMIN PROJESI
#  3 Ana Kategori | 9 Alt Kategori | Yapi Market Taksonomisi
# =============================================================
#
#  K1 - Isitma ve Sogutma:      klima | kombi | radyatorler
#  K2 - Aydinlatma ve Elektrik: kablolar | priz | sigorta-kutusu
#  K3 - Ahsap ve Insaat:        boya-ve-boya-malzemeleri | seramik-ve-fayans | ahsaplar
#
#  Usta tipleri: klima-ustasi, kombi-ustasi, elektrikci,
#                boyaci, seramik-ustasi, marangoz, bireysel

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import warnings

from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

import features   # tek kaynak: ozellik muhendisligi ve model egitimi

warnings.filterwarnings("ignore")
plt.rcParams["figure.figsize"] = (10, 6)

print("=" * 65)
print("  USTA MUSTERI TAHMIN PROJESI")
print("  3 Kategori | 9 Alt Kategori | Yapi Market Verisi")
print("=" * 65)


# ============================================================
# BOLUM 1: VERILERI YUKLE
# ============================================================
print("\n[1] Veriler yukleniyor...")

customers, products, transactions, tx, categories, subcategories = features.veri_yukle()

print(f"  {len(customers)} musteri | {len(products)} urun | {len(transactions)} islem")
print(f"  Birlestirilmis islem tablosu: {tx.shape}")
print(f"\n  Ana kategoriler (K1/K2/K3):")
for _, r in categories.iterrows():
    n = (tx["cat_id"] == r["cat_id"]).sum()
    print(f"    {r['cat_id']} - {r['cat_name']}: {n} islem")


# ============================================================
# BOLUM 2: TUM OZELLIKLERI HESAPLA VE BIRLESTIR
# ============================================================
print("\n[2] Ozellikler hesaplaniyor...")

df, feature_cols = features.ozellik_matrisi_olustur(customers, transactions, tx)

print(f"\n  Toplam ozellik sayisi: {len(feature_cols)}")
print(f"    Ana kategori harcama : {len([c for c in feature_cols if c.startswith('spend_K')])}")
print(f"    Alt kategori harcama : {len([c for c in feature_cols if c.startswith('subcat_')])}")
print(f"    Uzmanlik oranlari    : {len([c for c in feature_cols if c.endswith('_ratio')])}")
print(f"    Diger                : {len([c for c in feature_cols if not c.startswith('spend_') and not c.startswith('subcat_') and not c.endswith('_ratio')])}")


# ============================================================
# BOLUM 3: MODEL EGITIMI
# ============================================================
print("\n[3] Model egitimi...")

le, ro, ka, X, X_tr, X_te, y_tr, y_te, pred_df = features.model_egit(df, feature_cols)

print(f"  Egitim: {X_tr.shape[0]} musteri | Test: {X_te.shape[0]} musteri")
print(f"\n  Karar Agaci   dogrulugu : %{accuracy_score(y_te, ka.predict(X_te))*100:.1f}")
print(f"  Rastgele Orman dogrulugu: %{accuracy_score(y_te, ro.predict(X_te))*100:.1f}")

print("\n--- Siniflandirma Raporu (Rastgele Orman, Test Seti) ---")
print(classification_report(y_te, ro.predict(X_te), target_names=le.classes_, zero_division=0))


# ============================================================
# BOLUM 4: EN ONEMLI OZELLIKLER
# ============================================================
print("\n[4] En onemli 15 ozellik:")

importance = pd.Series(ro.feature_importances_, index=feature_cols).sort_values(ascending=False)

def grup_bul(col):
    if col.startswith("subcat_"):    return "Alt Kategori"
    if col.startswith("spend_K"):    return "Ana Kategori"
    if col.endswith("_ratio") or col == "expertise_score": return "Oran/Uzmanlik"
    if "set_rate" in col or "basket" in col: return "Sepet"
    if col in ["morning_rate", "weekday_rate"]: return "Zaman"
    if col in ["pro_brand_rate", "large_package_rate"]: return "Pro Sinyal"
    return "Istatistik"

for i, (col, val) in enumerate(importance.head(15).items(), 1):
    bar = "#" * int(val * 300)
    print(f"  {i:2}. [{grup_bul(col):15s}] {col:45s} {val:.4f}  {bar}")


# ============================================================
# BOLUM 5: TAHMIN VE KAYDET
# ============================================================
print("\n[5] Tum musteriler tahminleniyor...")

results = pred_df.merge(customers[["customer_id", "first_name", "last_name", "city"]], on="customer_id")
results = results.merge(df[["customer_id", "morning_rate"]], on="customer_id")
results.to_csv("data/tahmin_sonuclari.csv", index=False)
print(f"  'data/tahmin_sonuclari.csv' kaydedildi.")

test_res  = results[results["split"] == "test"]
train_res = results[results["split"] == "train"]
print(f"\n  Test seti dogrulugu    : %{test_res['correct'].mean()*100:.1f}  ← gercek genelleme ({len(test_res)} musteri, hic gorulmemis)")
print(f"  Egitim seti dogrulugu  : %{train_res['correct'].mean()*100:.1f}  (referans degil — model bu veriyi gormüstü)")

print("\n  Uzmanlik orani ortalamasi - usta tipine gore:")
ratio_cols = ["klima_ratio", "kombi_ratio", "boya_ratio", "seramik_ratio", "ahsap_ratio", "kablo_ratio"]
ratio_df = df[["label"] + [c for c in ratio_cols if c in df.columns]].groupby("label").mean().round(2)
print(ratio_df.to_string())


# ============================================================
# BOLUM 6: GRAFIKLER
# ============================================================
print("\n[6] Grafikler olusturuluyor...")

fig, axes = plt.subplots(2, 3, figsize=(18, 11))
fig.suptitle("Usta Musteri Tahmin — K1/K2/K3 | 9 Alt Kategori", fontsize=14, fontweight="bold")

# Grafik 1: En onemli 12 ozellik
ax = axes[0, 0]
importance.head(12).sort_values().plot(kind="barh", ax=ax, color="steelblue", edgecolor="white")
ax.set_title("En Onemli 12 Ozellik (Rastgele Orman)")
ax.set_xlabel("Onem Skoru")

# Grafik 2: Alt kategori uzmanlik oranlari
ax = axes[0, 1]
ratio_sutunlar = [c for c in df.columns if c.endswith("_ratio") and c in
                  ["klima_ratio", "kombi_ratio", "radyator_ratio", "kablo_ratio",
                   "priz_ratio", "sigorta_ratio", "boya_ratio", "seramik_ratio", "ahsap_ratio"]]
ratio_ozet = df[["label"] + ratio_sutunlar].groupby("label").mean()
ratio_ozet.T.plot(kind="bar", ax=ax, colormap="tab10", edgecolor="white")
ax.set_title("Alt Kategori Uzmanlik Oranlari")
ax.set_ylabel("Ortalama Oran")
ax.tick_params(axis="x", rotation=30)
ax.legend(fontsize=7, loc="upper right")

# Grafik 3: Toplu alim orani
ax = axes[0, 2]
order3 = df.groupby("label")["bulk_rate"].mean().sort_values(ascending=False).index
sns.boxplot(data=df, x="label", y="bulk_rate", order=order3, ax=ax, palette="Set2")
ax.set_title("Toplu Alim Orani (quantity > 5)")
ax.set_xlabel("")
ax.tick_params(axis="x", rotation=45)

# Grafik 4: Sabah alisveris orani
ax = axes[1, 0]
sabah_ozet = df.groupby("label")["morning_rate"].mean().sort_values(ascending=False)
sabah_ozet.plot(kind="bar", ax=ax, color="coral", edgecolor="white")
ax.set_title("Sabah Alisveris Orani (Saat < 11)")
ax.set_xlabel("")
ax.tick_params(axis="x", rotation=45)
ax.axhline(y=0.5, color="gray", linestyle="--", alpha=0.7)

# Grafik 5: Pro marka ve buyuk ambalaj
ax = axes[1, 1]
pro_ozet = df.groupby("label")[["pro_brand_rate", "large_package_rate"]].mean()
pro_ozet.plot(kind="bar", ax=ax, color=["#3498db", "#e74c3c"], edgecolor="white")
ax.set_title("Profesyonel Marka ve Buyuk Ambalaj")
ax.set_xlabel("")
ax.tick_params(axis="x", rotation=45)
ax.legend(["Pro Marka", "Buyuk Ambalaj"])

# Grafik 6: Karisiklik matrisi
ax = axes[1, 2]
cm = confusion_matrix(y_te, ro.predict(X_te))
sns.heatmap(cm, annot=True, fmt="d",
            xticklabels=le.classes_, yticklabels=le.classes_,
            cmap="Blues", ax=ax)
ax.set_title("Karisiklik Matrisi (Test)")
ax.set_xlabel("Tahmin")
ax.set_ylabel("Gercek")
ax.tick_params(axis="x", rotation=45)
ax.tick_params(axis="y", rotation=0)

plt.tight_layout()
plt.savefig("data/analiz_grafikleri.png", dpi=120, bbox_inches="tight")
print("  Grafik 'data/analiz_grafikleri.png' kaydedildi.")

print("\n" + "=" * 65)
print(f"  TAMAMLANDI  —  {len(feature_cols)} ozellik  |  RF: %{accuracy_score(y_te,ro.predict(X_te))*100:.0f}  |  DT: %{accuracy_score(y_te,ka.predict(X_te))*100:.0f}")
print("=" * 65)
