/**
 * Label tampil F-2026-10-23-120-V — konsumen murni kontrak
 * `asset-acquisition.ts` (BOT 3, vonis BOT 4 PR #635). UI menampilkan
 * hasil builder apa adanya: tidak memilih dasar fiskal, tidak
 * menghitung harga pasar, tidak menebak jenis perolehan.
 * Jenis di luar daftar terdaftar = temuan bernama, bukan label sah.
 */
import {
  isRegisteredAcquisitionType,
  type AcquisitionCounterpartKind,
  type AssetAcquisitionType,
} from "./asset-acquisition"

export type AssetAcquisitionTone = "success" | "warning" | "danger" | "default"

export interface AssetAcquisitionTypeDisplay {
  label: string
  tone: AssetAcquisitionTone
  /** Teks nilai mentah yang tidak terdaftar (temuan bersih-data). */
  rawType: string | null
}

const REGISTERED_LABELS: Record<
  AssetAcquisitionType,
  { label: string; tone: AssetAcquisitionTone }
> = {
  CASH_PURCHASE: { label: "Pembelian Tunai", tone: "success" },
  CREDIT_PURCHASE: { label: "Pembelian Kredit (Utang Usaha)", tone: "warning" },
  GRANT_DONATION: { label: "Hibah / Sumbangan", tone: "default" },
  CAPITAL_CONTRIBUTION: { label: "Setoran Modal Non-Tunai", tone: "default" },
  EXCHANGE: { label: "Tukar-Menukar / Tukar Tambah", tone: "warning" },
}

export function assetAcquisitionTypeDisplay(
  type: string | null | undefined,
): AssetAcquisitionTypeDisplay {
  if (!isRegisteredAcquisitionType(type)) {
    return {
      label: "Jenis perolehan tidak terdaftar",
      tone: "default",
      rawType: type ?? null,
    }
  }
  const registered = REGISTERED_LABELS[type]
  return { label: registered.label, tone: registered.tone, rawType: null }
}

export const ACQUISITION_COUNTERPART_LABELS: Record<
  AcquisitionCounterpartKind,
  string
> = {
  "cash-bank": "Kas / Bank",
  "accounts-payable": "Utang Usaha",
  "grant-income": "Pendapatan Hibah",
  equity: "Ekuitas (Modal)",
  "exchange-settlement": "Penyelesaian Tukar-Menukar",
}

export const ACQUISITION_FISCAL_BASIS_SOURCE_LABELS: Record<
  "actual-price" | "market-value" | "grantor-fiscal-book-value",
  string
> = {
  "actual-price": "Harga Sesungguhnya",
  "market-value": "Harga Pasar (penilaian terstruktur)",
  "grantor-fiscal-book-value": "Nilai Sisa Buku Fiskal Pemberi",
}

export const ACQUISITION_REJECT_LABELS: Record<string, string> = {
  "unregistered-acquisition-type": "Jenis perolehan tidak terdaftar",
  "missing-source-document": "Dokumen sumber perolehan belum tercatat",
  "missing-counterpart-account": "Akun lawan perolehan belum terpetakan",
  "missing-market-value": "Harga pasar belum tercatat",
  "missing-assessor": "Penilai harga pasar belum tercatat",
  "missing-grantor-fiscal-book-value":
    "Nilai sisa buku fiskal pemberi belum tercatat",
  "missing-surrendered-carrying-amount":
    "Nilai tercatat aset yang diserahkan belum tercatat",
}

export const ACQUISITION_VAT_EVIDENCE_LABELS: Record<
  "linked-invoice" | "none",
  string
> = {
  "linked-invoice": "Faktur pajak masukan tertaut",
  none: "Belum ada faktur pajak tertaut",
}
