# =============================================================
#  gemini.py — Gemini API entegrasyonu
#
#  Kullanım:
#    from gemini import kampanya_olustur
#    metin = kampanya_olustur(musteri_row, df_row)
# =============================================================

import google.generativeai as genai


def kampanya_olustur(musteri_row, df_row, api_key: str) -> str:
    """
    Müşteri profili ve özellik vektöründen kişiselleştirilmiş
    kampanya metni üretir.

    Parametreler:
        musteri_row — results DataFrame'inden tek satır
        df_row      — df (özellik matrisi) DataFrame'inden tek satır
        api_key     — Gemini API anahtarı

    Dönüş:
        Kampanya metni (string)
    """
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    # En çok harcadığı 3 subkategoriyi bul
    subcat_cols = {
        "Klima":          df_row.get("subcat_klima", 0),
        "Kombi":          df_row.get("subcat_kombi", 0),
        "Radyatör":       df_row.get("subcat_radyatorler", 0),
        "Kablo":          df_row.get("subcat_kablolar", 0),
        "Priz":           df_row.get("subcat_priz", 0),
        "Sigorta Kutusu": df_row.get("subcat_sigorta-kutusu", 0),
        "Boya":           df_row.get("subcat_boya-ve-boya-malzemeleri", 0),
        "Seramik":        df_row.get("subcat_seramik-ve-fayans", 0),
        "Ahşap":          df_row.get("subcat_ahsaplar", 0),
    }
    top3 = sorted(subcat_cols.items(), key=lambda x: x[1], reverse=True)[:3]
    top3_str = ", ".join([f"{k} ({v:,.0f} ₺)" for k, v in top3 if v > 0])

    prompt = f"""
Bir yapı marketi CRM sistemi için müşteriye özel kampanya mesajı yazıyorsun.

Müşteri Profili:
- Usta tipi: {musteri_row['predicted_type']}
- En çok harcadığı kategoriler: {top3_str}
- Toplam harcama: {df_row['total_spend']:,.0f} ₺
- Alışveriş sıklığı: {df_row['active_months']} aktif ay, {df_row['transaction_count']} işlem
- Toplu alım oranı: %{df_row['bulk_rate']*100:.0f} (adet > 5)
- Profesyonel marka tercihi: %{df_row['pro_brand_rate']*100:.0f}
- Sabah alışveriş oranı: %{df_row['morning_rate']*100:.0f}

Görev:
Bu müşteriye özel, kısa ve samimi bir kampanya mesajı yaz.
Mesaj 3-4 cümle olsun. Usta tipine uygun ürün veya hizmet öner.
Sadece kampanya metnini yaz, başlık veya açıklama ekleme.
"""
    return model.generate_content(prompt).text
