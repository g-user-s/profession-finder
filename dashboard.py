# =============================================================
#  USTA MUSTERI TAHMIN SİSTEMİ — PROFESYONEl DASHBOARD
#  Calistir: streamlit run dashboard.py
# =============================================================

import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import warnings

from sklearn.model_selection import learning_curve
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, classification_report,
                             confusion_matrix)

import features   # tek kaynak: ozellik muhendisligi ve model egitimi
from gemini import kampanya_olustur

warnings.filterwarnings("ignore")

# ── Sayfa Ayarları ─────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Usta Müşteri Analizi",
    page_icon="🔧",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# ── Renk Paleti ────────────────────────────────────────────────────────────
RENKLER = {
    "klima-ustasi"  : "#2980b9",
    "kombi-ustasi"  : "#e74c3c",
    "elektrikci"    : "#f39c12",
    "boyaci"        : "#3498db",
    "seramik-ustasi": "#9b59b6",
    "marangoz"      : "#8B4513",
    "bireysel"      : "#95a5a6",
}

USTA_EMOJILERI = {
    "klima-ustasi"  : "❄️",
    "kombi-ustasi"  : "🔥",
    "elektrikci"    : "⚡",
    "boyaci"        : "🎨",
    "seramik-ustasi": "🪟",
    "marangoz"      : "🪵",
    "bireysel"      : "🏠",
}

# ── CSS ────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    /* Genel arka plan */
    .stApp { background-color: #f4f6f9; }

    /* Ana başlık kutusu */
    .header-box {
        background: linear-gradient(135deg, #1e3a5f 0%, #2980b9 100%);
        padding: 2rem 2.5rem;
        border-radius: 12px;
        color: white;
        margin-bottom: 1.5rem;
    }
    .header-box h1 { color: white; font-size: 2rem; margin: 0; }
    .header-box p  { color: #cce3f5; font-size: 0.95rem; margin: 0.4rem 0 0 0; }

    /* KPI kart */
    .kpi-card {
        background: white;
        border-radius: 10px;
        padding: 1.2rem 1.4rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.07);
        border-left: 5px solid;
        height: 100%;
    }
    .kpi-title  { font-size: 0.8rem; color: #888; font-weight: 600;
                  text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi-value  { font-size: 2rem; font-weight: 700; color: #1e3a5f;
                  line-height: 1.1; margin: 0.3rem 0; }
    .kpi-sub    { font-size: 0.78rem; color: #aaa; }

    /* Bölüm başlığı */
    .section-title {
        font-size: 1.1rem; font-weight: 700;
        color: #1e3a5f; margin: 0.5rem 0 1rem 0;
        padding-bottom: 0.4rem;
        border-bottom: 2px solid #2980b9;
    }

    /* Usta rozeti */
    .usta-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        color: white;
        font-size: 0.8rem;
        font-weight: 600;
    }

    /* Bilgi kutusu */
    .info-box {
        background: #eaf4fb;
        border-left: 4px solid #2980b9;
        padding: 0.8rem 1rem;
        border-radius: 0 8px 8px 0;
        margin: 0.5rem 0;
        font-size: 0.88rem;
        color: #1e3a5f;
    }

    /* Tab stil */
    div[data-testid="stTabs"] button {
        font-weight: 600;
        font-size: 0.95rem;
    }

    /* Grafik kartı */
    .chart-card {
        background: white;
        border-radius: 10px;
        padding: 1.2rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.07);
        margin-bottom: 1rem;
    }
</style>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════
# VERİ + MODEL — Önbellekli fonksiyon (sayfa her yenilendiğinde yeniden
#                çalışmaz; hız kazanımı sağlar)
# ══════════════════════════════════════════════════════════════════════════
@st.cache_data
def hazirla():
    # ── Veri + Özellikler + Model ───────────────────────────────────────
    customers, products, transactions, tx, categories, subcategories = features.veri_yukle()
    df, feature_cols = features.ozellik_matrisi_olustur(customers, transactions, tx)
    le, ro, ka, X, X_tr, X_te, y_tr, y_te, pred_df = features.model_egit(df, feature_cols)

    # ── Metrikler ───────────────────────────────────────────────────────
    y_pred_ro = ro.predict(X_te)
    y_pred_ka = ka.predict(X_te)
    dogruluk_ro = accuracy_score(y_te, y_pred_ro)
    dogruluk_ka = accuracy_score(y_te, y_pred_ka)
    cm    = confusion_matrix(y_te, y_pred_ro)
    rapor = classification_report(y_te, y_pred_ro, target_names=le.classes_,
                                  output_dict=True, zero_division=0)
    onem  = pd.Series(ro.feature_importances_, index=feature_cols)\
              .sort_values(ascending=False)

    results = pred_df.merge(
        customers[["customer_id", "first_name", "last_name", "city", "age",
                   "gender", "segment"]],
        on="customer_id"
    )

    return dict(
        customers=customers, products=products, transactions=transactions,
        tx=tx, categories=categories, subcategories=subcategories,
        df=df, feature_cols=feature_cols,
        le=le, ro=ro, ka=ka,
        X=X, X_tr=X_tr, X_te=X_te, y_tr=y_tr, y_te=y_te,
        y_pred_ro=y_pred_ro, y_pred_ka=y_pred_ka,
        dogruluk_ro=dogruluk_ro, dogruluk_ka=dogruluk_ka,
        cm=cm, rapor=rapor, onem=onem, results=results,
    )


# ── Veriyi Yükle ───────────────────────────────────────────────────────────
with st.spinner("Model hazırlanıyor..."):
    v = hazirla()

df           = v["df"]
results      = v["results"]
transactions = v["transactions"]
tx           = v["tx"]
categories   = v["categories"]
le           = v["le"]
onem         = v["onem"]


# ══════════════════════════════════════════════════════════════════════════
# ANA BAŞLIK
# ══════════════════════════════════════════════════════════════════════════
st.markdown(f"""
<div class="header-box">
  <h1>🔧 Yapı Market — Usta Müşteri Tahmin Sistemi</h1>
  <p>Müşteri alışveriş davranışlarından usta tespiti · {len(v["feature_cols"])} özellik · Random Forest sınıflandırması</p>
</div>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════
# SEKMELER
# ══════════════════════════════════════════════════════════════════════════
tab1, tab2, tab3, tab4 = st.tabs([
    "📊  Genel Bakış",
    "👥  Müşteri Analizi",
    "🤖  Model Performansı",
    "🔍  Özellik Analizi",
])


# ══════════════════════════════════════════════════════════════════════════
# TAB 1 — GENEL BAKIŞ
# ══════════════════════════════════════════════════════════════════════════
with tab1:

    # ── KPI Kartları ───────────────────────────────────────────────────
    toplam       = len(results)
    usta_sayisi  = (results["predicted_type"] != "bireysel").sum()
    bireysel_say = toplam - usta_sayisi
    dogruluk     = v["dogruluk_ro"]
    # Güven skoru yalnızca test müşterileri üzerinden alınır.
    # Eğitim müşterileri modelin daha önce gördüğü verilerdir;
    # onların güven skoru gerçek genellemeyi yansıtmaz.
    test_results = results[results["split"] == "test"]
    ort_guven    = test_results["confidence"].mean()

    c1, c2, c3, c4, c5 = st.columns(5)
    kpiler = [
        (c1, "Toplam Müşteri",       f"{toplam}",            "#2980b9", "veri setindeki tüm müşteriler"),
        (c2, "Tahmin Edilen Usta",   f"{usta_sayisi}",        "#27ae60", f"toplam {toplam} içinden"),
        (c3, "Bireysel Müşteri",     f"{bireysel_say}",       "#e67e22", "usta olmayan segment"),
        (c4, "Model Doğruluğu",      f"%{dogruluk*100:.0f}",  "#8e44ad", "Random Forest (test seti)"),
        (c5, "Ort. Güven Skoru",     f"%{ort_guven*100:.0f}", "#16a085", f"test seti ({len(test_results)} müşteri)"),
    ]
    for col, baslik, deger, renk, alt in kpiler:
        with col:
            st.markdown(f"""
            <div class="kpi-card" style="border-left-color:{renk}">
              <div class="kpi-title">{baslik}</div>
              <div class="kpi-value" style="color:{renk}">{deger}</div>
              <div class="kpi-sub">{alt}</div>
            </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # ── İki Grafik: Dağılım + Kategori Harcama ─────────────────────────
    col_sol, col_sag = st.columns([1, 1])

    with col_sol:
        st.markdown('<p class="section-title">Tahmin Edilen Usta Tipi Dağılımı</p>', unsafe_allow_html=True)
        tip_sayilari = results["predicted_type"].value_counts().reset_index()
        tip_sayilari.columns = ["usta_tipi","sayi"]
        tip_sayilari["emoji"] = tip_sayilari["usta_tipi"].map(USTA_EMOJILERI)
        tip_sayilari["etiket"] = tip_sayilari["emoji"] + " " + tip_sayilari["usta_tipi"]
        fig_pie = px.pie(
            tip_sayilari, values="sayi", names="etiket",
            color="usta_tipi", color_discrete_map=RENKLER,
            hole=0.45,
        )
        fig_pie.update_traces(textposition="outside", textinfo="percent+label",
                              pull=[0.03]*len(tip_sayilari))
        fig_pie.update_layout(
            showlegend=False, height=340, margin=dict(t=10, b=10, l=10, r=10),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)"
        )
        st.plotly_chart(fig_pie, use_container_width=True)

    with col_sag:
        st.markdown('<p class="section-title">Kategoriye Göre Toplam Satış (TL)</p>', unsafe_allow_html=True)
        kat_harcama = tx.groupby("cat_id")["total_amount"].sum().reset_index()
        kat_harcama = kat_harcama.merge(categories[["cat_id", "cat_name"]], on="cat_id")
        kat_harcama = kat_harcama.sort_values("total_amount", ascending=True)
        fig_bar = px.bar(
            kat_harcama, x="total_amount", y="cat_name",
            orientation="h",
            text=kat_harcama["total_amount"].apply(lambda x: f"{x:,.0f} ₺"),
            color="total_amount", color_continuous_scale="Blues",
        )
        fig_bar.update_traces(textposition="outside")
        fig_bar.update_layout(
            height=340, coloraxis_showscale=False,
            xaxis_title="Toplam Harcama (TL)", yaxis_title="",
            margin=dict(t=10, b=10, l=10, r=80),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)"
        )
        st.plotly_chart(fig_bar, use_container_width=True)

    # ── Şehir Dağılımı + Segment Karşılaştırma ─────────────────────────
    col3, col4 = st.columns([1, 1])

    with col3:
        st.markdown('<p class="section-title">Şehire Göre Müşteri Dağılımı</p>', unsafe_allow_html=True)
        sehir_df = results.groupby(["city", "predicted_type"]).size().reset_index(name="sayi")
        fig_sehir = px.bar(
            sehir_df, x="city", y="sayi", color="predicted_type",
            color_discrete_map=RENKLER, barmode="stack",
        )
        fig_sehir.update_layout(
            height=300, xaxis_title="", yaxis_title="Müşteri",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, font_size=10),
            margin=dict(t=40,b=10,l=10,r=10),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)"
        )
        st.plotly_chart(fig_sehir, use_container_width=True)

    with col4:
        st.markdown('<p class="section-title">Usta vs Bireysel — Alışveriş Davranışı</p>', unsafe_allow_html=True)
        results_m = results.merge(
            df[["customer_id", "total_spend", "transaction_count",
                "bulk_rate", "morning_rate"]],
            on="customer_id"
        )
        karsilastirma = results_m.copy()
        karsilastirma["segment"] = karsilastirma["predicted_type"].apply(
            lambda x: "Usta" if x != "bireysel" else "Bireysel"
        )
        seg = karsilastirma.groupby("segment").agg(
            Ort_Harcama    =("total_spend",        "mean"),
            Ort_Islem      =("transaction_count",  "mean"),
            Toplu_Alim     =("bulk_rate",          "mean"),
            Sabah_Alisveris=("morning_rate",        "mean"),
        ).round(2).T.reset_index()
        seg.columns = ["Özellik","Bireysel","Usta"]
        fig_seg = go.Figure()
        fig_seg.add_trace(go.Bar(name="Bireysel", x=seg["Özellik"], y=seg["Bireysel"],
                                  marker_color="#95a5a6"))
        fig_seg.add_trace(go.Bar(name="Usta", x=seg["Özellik"], y=seg["Usta"],
                                  marker_color="#2980b9"))
        fig_seg.update_layout(
            barmode="group", height=300,
            legend=dict(orientation="h", yanchor="bottom", y=1.02),
            margin=dict(t=40,b=10,l=10,r=10),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)"
        )
        st.plotly_chart(fig_seg, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════
# TAB 2 — MÜŞTERİ ANALİZİ
# ══════════════════════════════════════════════════════════════════════════
with tab2:

    sol, sag = st.columns([1, 2])

    with sol:
        st.markdown('<p class="section-title">Müşteri Seç</p>', unsafe_allow_html=True)

        # Filtreler
        tip_filtre = st.multiselect(
            "Usta Tipi", options=sorted(results["predicted_type"].unique()),
            default=sorted(results["predicted_type"].unique())
        )
        sehir_filtre = st.multiselect(
            "Şehir", options=sorted(results["city"].unique()),
            default=sorted(results["city"].unique())
        )
        guven_min = st.slider("Min. Güven Skoru", 0.0, 1.0, 0.0, 0.05)

        filtreli = results[
            results["predicted_type"].isin(tip_filtre) &
            results["city"].isin(sehir_filtre) &
            (results["confidence"] >= guven_min)
        ]

        if filtreli.empty:
            st.warning("Seçilen filtrelere uyan müşteri bulunamadı.")
            secilen_id = None
        else:
            secenekler = [
                f"{r.customer_id} — {r.first_name} {r.last_name}"
                for _, r in filtreli.iterrows()
            ]
            secim = st.selectbox("Detay için müşteri seç", secenekler)
            secilen_id = secim.split(" — ")[0]

    with sag:
        if secilen_id:
            musteri_row = results[results["customer_id"] == secilen_id].iloc[0]
            musteri_df  = df[df["customer_id"] == secilen_id].iloc[0]

            # Başlık
            tip  = musteri_row["predicted_type"]
            renk = RENKLER.get(tip, "#888")
            emj  = USTA_EMOJILERI.get(tip, "❓")

            st.markdown(f"""
            <div style="background:white;border-radius:10px;padding:1.2rem 1.5rem;
                        box-shadow:0 2px 8px rgba(0,0,0,0.07);margin-bottom:1rem;">
              <h3 style="margin:0;color:#1e3a5f">
                {musteri_row['first_name']} {musteri_row['last_name']}
                &nbsp;<span class="usta-badge" style="background:{renk}">{emj} {tip}</span>
              </h3>
              <p style="color:#888;margin:0.3rem 0 0 0;font-size:0.85rem">
                {musteri_row['city']} · {musteri_row['age']} yaş ·
                Güven: <b style="color:{renk}">{musteri_row['confidence']*100:.0f}%</b>
              </p>
            </div>
            """, unsafe_allow_html=True)

            m1, m2, m3, m4 = st.columns(4)
            m1.metric("İşlem Sayısı",   int(musteri_df["transaction_count"]))
            m2.metric("Toplam Harcama", f"{musteri_df['total_spend']:,.0f} ₺")
            m3.metric("Toplu Alım",     f"%{musteri_df['bulk_rate']*100:.0f}")
            m4.metric("Sabah Alışveriş",f"%{musteri_df['morning_rate']*100:.0f}")

            # ── Radar Grafik ──────────────────────────────────────────
            radar_kategoriler = ["Klima","Kombi","Radyatör",
                                  "Kablo","Priz","Sigorta",
                                  "Boya","Seramik","Ahşap","Uzmanlık"]
            radar_degerler = [
                musteri_df.get("klima_ratio",0),
                musteri_df.get("kombi_ratio",0),
                musteri_df.get("radyator_ratio",0),
                musteri_df.get("kablo_ratio",0),
                musteri_df.get("priz_ratio",0),
                musteri_df.get("sigorta_ratio",0),
                musteri_df.get("boya_ratio",0),
                musteri_df.get("seramik_ratio",0),
                musteri_df.get("ahsap_ratio",0),
                musteri_df.get("expertise_score",0),
            ]
            # Aynı tip müşterilerin ortalamasını da ekle
            ayni_tip = df[df["label"] == musteri_row["label"]]
            ort_degerler = [
                ayni_tip["klima_ratio"].mean(),
                ayni_tip["kombi_ratio"].mean(),
                ayni_tip["radyator_ratio"].mean(),
                ayni_tip["kablo_ratio"].mean(),
                ayni_tip["priz_ratio"].mean(),
                ayni_tip["sigorta_ratio"].mean(),
                ayni_tip["boya_ratio"].mean(),
                ayni_tip["seramik_ratio"].mean(),
                ayni_tip["ahsap_ratio"].mean(),
                ayni_tip["expertise_score"].mean(),
            ]

            fig_radar = go.Figure()
            fig_radar.add_trace(go.Scatterpolar(
                r=radar_degerler + [radar_degerler[0]],
                theta=radar_kategoriler + [radar_kategoriler[0]],
                fill="toself", name=f"{musteri_row['ad']}",
                line_color=renk, fillcolor=renk.replace(")",",0.2)").replace("rgb","rgba"),
                line_width=2.5
            ))
            fig_radar.add_trace(go.Scatterpolar(
                r=ort_degerler + [ort_degerler[0]],
                theta=radar_kategoriler + [radar_kategoriler[0]],
                fill="toself", name=f"{tip} ortalaması",
                line_color="#bbb", fillcolor="rgba(180,180,180,0.1)",
                line_dash="dot", line_width=1.5
            ))
            fig_radar.update_layout(
                polar=dict(radialaxis=dict(visible=True, range=[0,1])),
                showlegend=True, height=280,
                legend=dict(orientation="h", y=-0.1),
                margin=dict(t=10,b=30,l=10,r=10),
                paper_bgcolor="rgba(0,0,0,0)"
            )
            st.plotly_chart(fig_radar, use_container_width=True)

            # ── Bu Müşterinin İşlem Geçmişi ──────────────────────────
            st.markdown('<p class="section-title">Alışveriş Geçmişi</p>', unsafe_allow_html=True)
            musteri_islemler = tx[tx["customer_id"] == secilen_id].merge(
                v["products"][["product_id", "product_name"]], on="product_id"
            ).merge(categories[["cat_id", "cat_name"]], on="cat_id")
            goster = musteri_islemler[
                ["date", "product_name", "cat_name", "quantity", "total_amount"]
            ].sort_values("date", ascending=False)
            goster.columns = ["Tarih", "Ürün", "Kategori", "Adet", "Tutar (₺)"]
            st.dataframe(goster, use_container_width=True, height=200)

    st.divider()

    # ── Alt tablo: Tüm Müşteriler ───────────────────────────────────────
    st.markdown('<p class="section-title">Tüm Tahmin Sonuçları</p>', unsafe_allow_html=True)

    tablo = filtreli[["customer_id", "first_name", "last_name", "city", "age",
                       "predicted_type", "confidence", "label", "correct"]].copy()
    tablo.columns = ["ID", "Ad", "Soyad", "Şehir", "Yaş",
                     "Tahmin", "Güven", "Gerçek", "✓"]

    def renk_satir(row):
        if row["✓"] == True:
            return ["background-color:#f0fff4"]*len(row)
        else:
            return ["background-color:#fff5f5"]*len(row)

    tablo_styled = tablo.style\
        .apply(renk_satir, axis=1)\
        .format({"Güven": "{:.0%}"})\
        .set_properties(**{"font-size": "13px"})

    st.dataframe(tablo_styled, use_container_width=True, height=380)

    dogru_sayi  = filtreli["correct"].sum()
    yanlis_sayi = len(filtreli) - dogru_sayi
    st.markdown(
        f'<div class="info-box">Gösterilen <b>{len(filtreli)}</b> müşteriden '
        f'<b style="color:#27ae60">{dogru_sayi} doğru</b> · '
        f'<b style="color:#e74c3c">{yanlis_sayi} yanlış</b> tahmin</div>',
        unsafe_allow_html=True
    )


# ══════════════════════════════════════════════════════════════════════════
# TAB 3 — MODEL PERFORMANSI
# ══════════════════════════════════════════════════════════════════════════
with tab3:

    # ── Model Karşılaştırma KPI ─────────────────────────────────────────
    st.markdown('<p class="section-title">Model Karşılaştırması</p>', unsafe_allow_html=True)
    mk1, mk2, mk3, mk4 = st.columns(4)

    mk1.metric("Random Forest", f"%{v['dogruluk_ro']*100:.0f}",
               delta=f"+{(v['dogruluk_ro']-v['dogruluk_ka'])*100:.0f}% DT'ye göre")
    mk2.metric("Karar Ağacı",   f"%{v['dogruluk_ka']*100:.0f}")
    mk3.metric("Özellik Sayısı","43", delta="+23 (eski modele göre)")
    mk4.metric("Test Seti",     "10 müşteri", delta="50'nin %20'si")

    st.markdown("<br>", unsafe_allow_html=True)

    col_a, col_b = st.columns([1, 1])

    with col_a:
        # ── Karışıklık Matrisi ──────────────────────────────────────────
        st.markdown('<p class="section-title">Karışıklık Matrisi (Random Forest)</p>', unsafe_allow_html=True)
        st.markdown(
            '<div class="info-box">Satırlar gerçek etiketi, sütunlar tahmin edilen etiketi gösterir. '
            'Köşegen = doğru tahminler. Köşegen dışı = yanlış.</div>',
            unsafe_allow_html=True
        )
        fig_cm = px.imshow(
            v["cm"],
            x=list(le.classes_), y=list(le.classes_),
            text_auto=True, color_continuous_scale="Blues",
            labels={"x":"Tahmin","y":"Gerçek","color":"Adet"}
        )
        fig_cm.update_layout(
            height=400, margin=dict(t=10,b=10,l=10,r=10),
            paper_bgcolor="rgba(0,0,0,0)"
        )
        st.plotly_chart(fig_cm, use_container_width=True)

    with col_b:
        # ── Sınıf Bazlı F1 Skoru ───────────────────────────────────────
        st.markdown('<p class="section-title">Sınıf Bazlı Performans Metrikleri</p>', unsafe_allow_html=True)
        st.markdown(
            '<div class="info-box">'
            '<b>Precision:</b> "Boyacı" dedigimizin kaçı gerçekten boyacı?&nbsp;·&nbsp;'
            '<b>Recall:</b> Tüm boyacıların kaçını bulduk?&nbsp;·&nbsp;'
            '<b>F1:</b> İkisinin dengeli ortalaması.'
            '</div>', unsafe_allow_html=True
        )
        rapor_df = []
        for sinif in le.classes_:
            if sinif in v["rapor"]:
                r = v["rapor"][sinif]
                rapor_df.append({
                    "Usta Tipi"  : USTA_EMOJILERI.get(sinif,"") + " " + sinif,
                    "Precision"  : round(r["precision"],2),
                    "Recall"     : round(r["recall"],2),
                    "F1-Score"   : round(r["f1-score"],2),
                    "Destek"     : int(r["support"]),
                })
        rapor_df = pd.DataFrame(rapor_df)

        fig_rapor = go.Figure()
        for metrik, renk in [("Precision","#3498db"),("Recall","#2ecc71"),("F1-Score","#e74c3c")]:
            fig_rapor.add_trace(go.Bar(
                name=metrik, x=rapor_df["Usta Tipi"], y=rapor_df[metrik],
                marker_color=renk, opacity=0.85
            ))
        fig_rapor.update_layout(
            barmode="group", height=320, yaxis_range=[0,1.15],
            legend=dict(orientation="h", y=1.1),
            margin=dict(t=40,b=10,l=10,r=10),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            xaxis_tickangle=-30
        )
        st.plotly_chart(fig_rapor, use_container_width=True)

    # ── Öğrenme Eğrisi ─────────────────────────────────────────────────
    st.markdown('<p class="section-title">Öğrenme Eğrisi — Veri Miktarı vs Doğruluk</p>', unsafe_allow_html=True)
    st.markdown(
        '<div class="info-box">Ne kadar veri eklersek model o kadar iyi öğrenir — '
        'ancak belirli bir noktadan sonra iyileşme yavaşlar (azalan getiri yasası). '
        'Her nokta 5 katlı çapraz doğrulamanın ortalamasıdır; veri karıştırılmış ve '
        'sınıf dengesi korunmuştur (stratified).</div>',
        unsafe_allow_html=True
    )

    X_all = v["X"]
    y_all = le.transform(df["label"])
    # learning_curve: veriyi karıştırır (shuffle=True), stratified K-Fold uygular.
    # X_all[:n] prefix dilimleme yerine her eğitim boyutunda rastgele örnekleme yapar.
    train_sizes = np.linspace(0.4, 1.0, 7)
    for estimator, renk, isim, cizgi in [
        (RandomForestClassifier(n_estimators=30, max_depth=5, random_state=42),
         "#2980b9", "Random Forest", dict(color="#2980b9", width=2.5)),
        (DecisionTreeClassifier(max_depth=5, random_state=42),
         "#e74c3c", "Karar Ağacı",  dict(color="#e74c3c", width=2, dash="dot")),
    ]:
        pass  # hesaplama aşağıda tek seferde yapılır

    ts_ro, _, te_ro = learning_curve(
        RandomForestClassifier(n_estimators=30, max_depth=5, random_state=42),
        X_all, y_all, train_sizes=train_sizes, cv=5,
        scoring="accuracy", shuffle=True, random_state=42
    )
    ts_ka, _, te_ka = learning_curve(
        DecisionTreeClassifier(max_depth=5, random_state=42),
        X_all, y_all, train_sizes=train_sizes, cv=5,
        scoring="accuracy", shuffle=True, random_state=42
    )

    fig_lc = go.Figure()
    fig_lc.add_trace(go.Scatter(
        x=ts_ro, y=te_ro.mean(axis=1), mode="lines+markers",
        name="Random Forest", line=dict(color="#2980b9", width=2.5),
        error_y=dict(type="data", array=te_ro.std(axis=1), visible=True, thickness=1.2)
    ))
    fig_lc.add_trace(go.Scatter(
        x=ts_ka, y=te_ka.mean(axis=1), mode="lines+markers",
        name="Karar Ağacı", line=dict(color="#e74c3c", width=2, dash="dot"),
        error_y=dict(type="data", array=te_ka.std(axis=1), visible=True, thickness=1.2)
    ))
    fig_lc.update_layout(
        height=300, xaxis_title="Eğitim Verisi Boyutu (örnek sayısı)",
        yaxis_title="Doğruluk (5-Fold CV ortalaması)", yaxis_range=[0, 1.05],
        legend=dict(orientation="h", y=1.1),
        margin=dict(t=30, b=10, l=10, r=10),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)"
    )
    st.plotly_chart(fig_lc, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════
# TAB 4 — ÖZELLİK ANALİZİ
# ══════════════════════════════════════════════════════════════════════════
with tab4:

    col_x, col_y = st.columns([1, 1])

    with col_x:
        # ── Özellik Önemleri ───────────────────────────────────────────
        st.markdown('<p class="section-title">En Önemli 15 Özellik (Random Forest)</p>', unsafe_allow_html=True)
        st.markdown(
            '<div class="info-box">Yüksek skor = model bu özelliğe daha çok bakıyor. '
            'Yeni eklenen özellikler ilk sıralara girdi.</div>', unsafe_allow_html=True
        )
        onem_df = onem.head(15).reset_index()
        onem_df.columns = ["ozellik","skor"]
        onem_df = onem_df.sort_values("skor")

        def ozellik_rengi(ad):
            if ad.startswith("subcat_"):  return "#e74c3c"   # kirmizi = alt kategori
            if ad.startswith("spend_K"):  return "#95a5a6"   # gri = ana kategori
            return "#2980b9"                                  # mavi = diger

        renkler_onem = [ozellik_rengi(o) for o in onem_df["ozellik"]]

        fig_onem = go.Figure(go.Bar(
            x=onem_df["skor"], y=onem_df["ozellik"],
            orientation="h", marker_color=renkler_onem,
            text=onem_df["skor"].round(3), textposition="outside"
        ))
        fig_onem.update_layout(
            height=430, xaxis_title="Önem Skoru",
            margin=dict(t=10,b=10,l=10,r=60),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)"
        )
        st.plotly_chart(fig_onem, use_container_width=True)
        st.markdown(
            "<small>🔴 Alt kategori &nbsp;&nbsp; 🔵 Davranışsal özellik &nbsp;&nbsp; ⚪ Ana kategori</small>",
            unsafe_allow_html=True
        )

    with col_y:
        # ── Kategori Yoğunlaşma Isı Haritası ─────────────────────────
        st.markdown('<p class="section-title">Kategori Oranı — Usta Tipine Göre Isı Haritası</p>', unsafe_allow_html=True)
        st.markdown(
            '<div class="info-box">Her satır bir usta tipi, her sütun bir kategori oranıdır. '
            'Koyu renk = o usta tipi o kategoriye yoğunlaşmış.</div>', unsafe_allow_html=True
        )
        oran_cols = ["klima_ratio","kombi_ratio","radyator_ratio",
                     "kablo_ratio","priz_ratio","sigorta_ratio",
                     "boya_ratio","seramik_ratio","ahsap_ratio","expertise_score"]
        oran_map  = {
            "klima_ratio"    :"Klima",
            "kombi_ratio"    :"Kombi",
            "radyator_ratio" :"Radyatör",
            "kablo_ratio"    :"Kablo",
            "priz_ratio"     :"Priz",
            "sigorta_ratio"  :"Sigorta",
            "boya_ratio"     :"Boya",
            "seramik_ratio"  :"Seramik",
            "ahsap_ratio"    :"Ahşap",
            "expertise_score":"Uzmanlık",
        }
        isi = df.groupby("label")[oran_cols].mean().round(2)
        isi.columns = [oran_map[c] for c in oran_cols]
        isi.index = [USTA_EMOJILERI.get(i,"")+" "+i for i in isi.index]

        fig_isi = px.imshow(
            isi, text_auto=True, color_continuous_scale="YlOrRd",
            aspect="auto"
        )
        fig_isi.update_layout(
            height=350, margin=dict(t=10,b=10,l=10,r=10),
            paper_bgcolor="rgba(0,0,0,0)",
            coloraxis_showscale=True
        )
        st.plotly_chart(fig_isi, use_container_width=True)

    # ── Zaman ve Davranış Özellikleri ──────────────────────────────────
    st.markdown('<p class="section-title">Davranışsal Özellikler — Usta Tipine Göre</p>', unsafe_allow_html=True)

    dav_cols = ["morning_rate", "weekday_rate",
                "bulk_rate", "pro_brand_rate",
                "large_package_rate", "regularity_score"]
    dav_isimleri = {
        "morning_rate"       :"Sabah Alışveriş",
        "weekday_rate"       :"Hafta İçi",
        "bulk_rate"          :"Toplu Alım",
        "pro_brand_rate"     :"Pro Marka",
        "large_package_rate" :"Büyük Ambalaj",
        "regularity_score"   :"Düzenlilik (düş. = iyi)",
    }
    dav_df = df.groupby("label")[dav_cols].mean().round(3)
    dav_df.columns = [dav_isimleri[c] for c in dav_cols]
    dav_melt = dav_df.reset_index().melt(
        id_vars="label", var_name="Özellik", value_name="Değer"
    )
    dav_melt["Emoji+Tip"] = dav_melt["label"].apply(
        lambda x: USTA_EMOJILERI.get(x,"")+" "+x
    )

    fig_dav = px.bar(
        dav_melt, x="Özellik", y="Değer", color="Emoji+Tip",
        barmode="group",
        color_discrete_sequence=list(RENKLER.values()),
    )
    fig_dav.update_layout(
        height=320,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, font_size=10),
        margin=dict(t=50,b=10,l=10,r=10),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)"
    )
    st.plotly_chart(fig_dav, use_container_width=True)

    # ── Scatter: Uzmanlık vs Toplu Alım ───────────────────────────────
    st.markdown('<p class="section-title">Uzmanlık Skoru × Toplu Alım Oranı</p>', unsafe_allow_html=True)
    st.markdown(
        '<div class="info-box">Her nokta bir müşteridir. '
        'Sağ üst köşe = hem uzmanlaşmış hem toplu alan → güçlü usta sinyali.</div>',
        unsafe_allow_html=True
    )
    scatter_df = df[["customer_id", "expertise_score", "bulk_rate", "label"]].merge(
        results[["customer_id", "first_name", "last_name", "confidence"]], on="customer_id"
    )
    scatter_df["isim"]  = scatter_df["first_name"] + " " + scatter_df["last_name"]
    scatter_df["emoji"] = scatter_df["label"].map(USTA_EMOJILERI)

    fig_sc = px.scatter(
        scatter_df, x="expertise_score", y="bulk_rate",
        color="label", color_discrete_map=RENKLER,
        size="confidence", size_max=20,
        hover_data={"isim":True,"label":True,
                    "confidence":":.0%","expertise_score":":.2f","bulk_rate":":.2f"},
        labels={"expertise_score":"Uzmanlık Skoru",
                "bulk_rate":"Toplu Alım Oranı",
                "label":"Usta Tipi"},
        symbol="label",
    )
    fig_sc.update_layout(
        height=350, legend=dict(orientation="h", y=1.1, font_size=10),
        margin=dict(t=50,b=10,l=10,r=10),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)"
    )
    st.plotly_chart(fig_sc, use_container_width=True)

# ── Alt Bilgi ──────────────────────────────────────────────────────────────
n_musteri = len(v["customers"])
n_islem   = len(v["transactions"])
n_ozellik = len(v["feature_cols"])
st.markdown(f"""
<div style="text-align:center;color:#bbb;font-size:0.8rem;margin-top:2rem;padding:1rem;
            border-top:1px solid #eee;">
  Yapı Market Usta Müşteri Tahmin Sistemi · {n_musteri} müşteri · {n_islem} işlem · {n_ozellik} özellik ·
  Random Forest Sınıflandırması
</div>
""", unsafe_allow_html=True)
