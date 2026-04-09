# =============================================================
#  USTA MUSTERI TAHMIN PROJESI
#  3 Ana Kategori | 9 Alt Kategori | Yapi Market Taksonomisi
# =============================================================
#
#  K1 - Isitma ve Sogutma:    klima | kombi | radyatorler
#  K2 - Aydinlatma ve Elektrik: kablolar | priz | sigorta-kutusu
#  K3 - Ahsap ve Insaat:       boya-ve-boya-malzemeleri | seramik-ve-fayans | ahsaplar
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

musteriler, urunler, islemler, islemler_genis, kategoriler, subkategoriler = features.veri_yukle()

print(f"  {len(musteriler)} musteri | {len(urunler)} urun | {len(islemler)} islem")
print(f"  Birlestirilmis islem tablosu: {islemler_genis.shape}")
print(f"\n  Ana kategoriler (K1/K2/K3):")
for _, r in kategoriler.iterrows():
    n = (islemler_genis["kategori_id"] == r["kategori_id"]).sum()
    print(f"    {r['kategori_id']} - {r['kategori_adi']}: {n} islem")


# ============================================================
# BOLUM 2: TUM OZELLIKLERI HESAPLA VE BIRLESTIR
# ============================================================
print("\n[2] Ozellikler hesaplaniyor...")

df, ozellik_sutunlari = features.ozellik_matrisi_olustur(musteriler, islemler, islemler_genis)

print(f"\n  Toplam ozellik sayisi: {len(ozellik_sutunlari)}")
print(f"    Ana kategori harcama : {len([c for c in ozellik_sutunlari if c.startswith('harcama_K')])}")
print(f"    Alt kategori harcama : {len([c for c in ozellik_sutunlari if c.startswith('subkat_')])}")
print(f"    Yogunlasma oranlari  : {len([c for c in ozellik_sutunlari if c.endswith('_orani') and 'birlikte' not in c])}")
print(f"    Diger                : {len([c for c in ozellik_sutunlari if not c.startswith('harcama_') and not c.startswith('subkat_') and not c.endswith('_orani')])}")


# ============================================================
# BOLUM 3: MODEL EGITIMI
# ============================================================
print("\n[3] Model egitimi...")

le, ro, ka, X, X_tr, X_te, y_tr, y_te, tahmin_df = features.model_egit(df, ozellik_sutunlari)

print(f"  Egitim: {X_tr.shape[0]} musteri | Test: {X_te.shape[0]} musteri")
print(f"\n  Karar Agaci   dogrulugu : %{accuracy_score(y_te, ka.predict(X_te))*100:.1f}")
print(f"  Rastgele Orman dogrulugu: %{accuracy_score(y_te, ro.predict(X_te))*100:.1f}")

print("\n--- Siniflandirma Raporu (Rastgele Orman, Test Seti) ---")
print(classification_report(y_te, ro.predict(X_te), target_names=le.classes_, zero_division=0))


# ============================================================
# BOLUM 4: EN ONEMLI OZELLIKLER
# ============================================================
print("\n[4] En onemli 15 ozellik:")

onem = pd.Series(ro.feature_importances_, index=ozellik_sutunlari).sort_values(ascending=False)

def grup_bul(oz):
    if oz.startswith("subkat_"):   return "Alt Kategori"
    if oz.startswith("harcama_K"): return "Ana Kategori"
    if oz.endswith("_orani") or oz == "uzmanlik_skoru": return "Oran/Yogunlasma"
    if "set" in oz or "sepet" in oz: return "Sepet"
    if oz in ["sabah_alisveris_orani","haftaici_alisveris_orani"]: return "Zaman"
    if oz in ["profesyonel_marka_orani","buyuk_ambalaj_orani"]: return "Pro Sinyal"
    return "Istatistik"

for i, (oz, deger) in enumerate(onem.head(15).items(), 1):
    bar = "#" * int(deger * 300)
    print(f"  {i:2}. [{grup_bul(oz):15s}] {oz:40s} {deger:.4f}  {bar}")


# ============================================================
# BOLUM 5: TAHMIN VE KAYDET
# ============================================================
print("\n[5] Tum musteriler tahminleniyor...")

sonuclar = tahmin_df.merge(musteriler[["customer_id","ad","soyad","sehir"]], on="customer_id")
sonuclar = sonuclar.merge(df[["customer_id","sabah_alisveris_orani"]], on="customer_id")
sonuclar.to_csv("data/tahmin_sonuclari.csv", index=False)
print(f"  'data/tahmin_sonuclari.csv' kaydedildi.")

# Doğruluk yalnızca test setinden ölçülür.
# Eğitim setindeki müşteriler modelin daha önce gördüğü verilerdir;
# onlar üzerindeki %100 doğruluk gerçek genelleme performansı değildir.
test_sonuc    = sonuclar[sonuclar["split"] == "test"]
egitim_sonuc  = sonuclar[sonuclar["split"] == "egitim"]
dogruluk_test = test_sonuc["dogru_mu"].mean()
dogruluk_egit = egitim_sonuc["dogru_mu"].mean()
print(f"\n  Test seti dogrulugu    : %{dogruluk_test*100:.1f}  ← gercek genelleme ({len(test_sonuc)} musteri, hic gorulmemis)")
print(f"  Egitim seti dogrulugu  : %{dogruluk_egit*100:.1f}  (referans degil — model bu veriyi gormüstü)")

print("\n  Uzmanlik orani ortalamasi - usta tipine gore:")
oran_cols = ["klima_orani","kombi_orani","boya_orani","seramik_orani","ahsap_orani","kablo_orani"]
oran_df = df[["gercek_etiket"] + [c for c in oran_cols if c in df.columns]].groupby("gercek_etiket").mean().round(2)
print(oran_df.to_string())


# ============================================================
# BOLUM 6: GRAFIKLER
# ============================================================
print("\n[6] Grafikler olusturuluyor...")

fig, axes = plt.subplots(2, 3, figsize=(18, 11))
fig.suptitle("Usta Musteri Tahmin — K1/K2/K3 | 9 Alt Kategori", fontsize=14, fontweight="bold")

# Grafik 1: En onemli 12 ozellik
ax = axes[0,0]
onem.head(12).sort_values().plot(kind="barh", ax=ax, color="steelblue", edgecolor="white")
ax.set_title("En Onemli 12 Ozellik (Rastgele Orman)")
ax.set_xlabel("Onem Skoru")

# Grafik 2: Alt kategori uzmanlik oranlari
ax = axes[0,1]
oran_sutunlar = [c for c in df.columns if c.endswith("_orani") and c in
                 ["klima_orani","kombi_orani","radyator_orani","kablo_orani",
                  "priz_orani","sigorta_orani","boya_orani","seramik_orani","ahsap_orani"]]
oran_ozet = df[["gercek_etiket"]+oran_sutunlar].groupby("gercek_etiket").mean()
oran_ozet.T.plot(kind="bar", ax=ax, colormap="tab10", edgecolor="white")
ax.set_title("Alt Kategori Uzmanlik Oranlari")
ax.set_ylabel("Ortalama Oran")
ax.tick_params(axis="x", rotation=30)
ax.legend(fontsize=7, loc="upper right")

# Grafik 3: Toplu alim orani
ax = axes[0,2]
order3 = df.groupby("gercek_etiket")["toplu_alim_orani"].mean().sort_values(ascending=False).index
sns.boxplot(data=df, x="gercek_etiket", y="toplu_alim_orani", order=order3, ax=ax, palette="Set2")
ax.set_title("Toplu Alim Orani (adet > 5)")
ax.set_xlabel("")
ax.tick_params(axis="x", rotation=45)

# Grafik 4: Sabah alisveris orani
ax = axes[1,0]
sabah_ozet = df.groupby("gercek_etiket")["sabah_alisveris_orani"].mean().sort_values(ascending=False)
sabah_ozet.plot(kind="bar", ax=ax, color="coral", edgecolor="white")
ax.set_title("Sabah Alisveris Orani (Saat < 11)")
ax.set_xlabel("")
ax.tick_params(axis="x", rotation=45)
ax.axhline(y=0.5, color="gray", linestyle="--", alpha=0.7)

# Grafik 5: Pro marka ve buyuk ambalaj
ax = axes[1,1]
pro_ozet = df.groupby("gercek_etiket")[["profesyonel_marka_orani","buyuk_ambalaj_orani"]].mean()
pro_ozet.plot(kind="bar", ax=ax, color=["#3498db","#e74c3c"], edgecolor="white")
ax.set_title("Profesyonel Marka ve Buyuk Ambalaj")
ax.set_xlabel("")
ax.tick_params(axis="x", rotation=45)
ax.legend(["Pro Marka","Buyuk Ambalaj"])

# Grafik 6: Karisiklik matrisi
ax = axes[1,2]
cm = confusion_matrix(y_te, ro.predict(X_te))
sns.heatmap(cm, annot=True, fmt="d",
            xticklabels=le.classes_, yticklabels=le.classes_,
            cmap="Blues", ax=ax)
ax.set_title(f"Karisiklik Matrisi (Test)")
ax.set_xlabel("Tahmin")
ax.set_ylabel("Gercek")
ax.tick_params(axis="x", rotation=45)
ax.tick_params(axis="y", rotation=0)

plt.tight_layout()
plt.savefig("data/analiz_grafikleri.png", dpi=120, bbox_inches="tight")
print("  Grafik 'data/analiz_grafikleri.png' kaydedildi.")

print("\n" + "=" * 65)
print(f"  TAMAMLANDI  —  {len(ozellik_sutunlari)} ozellik  |  RF: %{accuracy_score(y_te,ro.predict(X_te))*100:.0f}  |  DT: %{accuracy_score(y_te,ka.predict(X_te))*100:.0f}")
print("=" * 65)
