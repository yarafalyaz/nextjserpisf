/**
 * Label tampil F-2026-10-23-117-V — konsumen murni kontrak
 * `asset-use-status.ts` (BOT 3, vonis BOT 4 #625). UI menampilkan
 * keputusan builder apa adanya: tidak menebak status, tidak
 * mengklasifikasi held-for-sale, tidak menghitung penyusutan.
 * Status di luar daftar terdaftar = temuan bernama, bukan label sah.
 */
import {
  isRegisteredAssetUseStatus,
  type CronSkipReason,
} from "./asset-use-status"

export type AssetUseStatusTone = "success" | "warning" | "danger" | "default"

export interface AssetUseStatusDisplay {
  label: string
  tone: AssetUseStatusTone
  /** Teks nilai mentah yang tidak terdaftar (temuan bersih-data). */
  rawStatus: string | null
}

const REGISTERED_LABELS: Record<string, { label: string; tone: AssetUseStatusTone }> = {
  active: { label: "Aktif", tone: "success" },
  held_for_sale: { label: "Dimiliki untuk Dijual", tone: "warning" },
  disposed: { label: "Dilepas", tone: "danger" },
}

export function assetUseStatusDisplay(
  status: string | null | undefined,
): AssetUseStatusDisplay {
  const raw = status ?? "active"
  if (!isRegisteredAssetUseStatus(raw)) {
    return {
      label: "Status tidak terdaftar",
      tone: "default",
      rawStatus: raw,
    }
  }
  const registered = REGISTERED_LABELS[raw]
  return { label: registered.label, tone: registered.tone, rawStatus: null }
}

export const CRON_SKIP_REASON_LABELS: Record<CronSkipReason, string> = {
  disposed: "Sudah dilepas",
  "held-for-sale": "Dimiliki untuk Dijual — penyusutan komersial berhenti, fiskal tetap berjalan",
  "at-residual": "Nilai buku sudah di nilai residu — tersusutkan penuh, masih dipakai",
  "unregistered-status": "Status tidak terdaftar — temuan bersih-data",
}

/** Nama fakta held-for-sale (a)-(e) ala Putusan 3 untuk daftar yang hilang. */
export const HELD_FOR_SALE_FACT_LABELS: Record<"a" | "b" | "c" | "d" | "e", string> = {
  a: "Keputusan/persetujuan manajemen bernama bertanggal",
  b: "Tersedia dijual segera dalam kondisi sekarang",
  c: "Program aktif mencari pembeli (referensi dokumen penawaran)",
  d: "Penjualan sangat mungkin selesai dalam 12 bulan",
  e: "Harga penawaran wajar terhadap nilai wajar",
}
