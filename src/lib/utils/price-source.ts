import { formatNumber } from "@/lib/utils/format"

export type PriceSource = "price_list_tier" | "price_list_base" | "item_master"

/**
 * Label sumber harga terpilih per BR-TIER-09 (F-2026-10-21-018) — render APA
 * ADANYA dari kolom persist SalesInvoiceItem (priceSource/priceListMinQty),
 * BUKAN hitung ulang. `null`/tak dikenal = baris lama / konversi / edit tanpa
 * klaim historis → tidak menampilkan apa pun (jangan mengarang sumber).
 */
export function priceSourceLabel(
  priceSource: string | null | undefined,
  priceListMinQty?: number | null,
): string | null {
  switch (priceSource) {
    case "price_list_tier": {
      if (priceListMinQty == null || !Number.isFinite(priceListMinQty)) return null
      const decimals = Number.isInteger(priceListMinQty) ? 0 : 2
      return `Harga tingkat >= ${formatNumber(priceListMinQty, decimals)} — Daftar Harga`
    }
    case "price_list_base":
      return "Harga daftar"
    case "item_master":
      return "Harga master"
    default:
      return null
  }
}
