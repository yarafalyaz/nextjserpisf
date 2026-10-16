import { AlertTriangle, ClipboardCheck, ListChecks } from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * Daftar halaman di sub-hub Pengendalian Mutu (`/produksi/qc`).
 *
 * Anak-anaknya sengaja tidak masuk sidebar (sidebar hanya dua level), jadi daftar ini
 * yang menjadi sumbernya. Dulu ditulis langsung di halaman; sekarang dipisah supaya bisa
 * dijaga tes `section-lists-parity.test.ts` — setiap halaman QC di disk wajib terdaftar,
 * dan izinnya harus sama dengan guard halamannya.
 */
export interface QcSectionItem {
  href: string
  label: string
  desc: string
  icon: LucideIcon
  /** Harus sama dengan `requirePermission()` di halaman tujuan. */
  permission: string
}

export const QC_SECTIONS: QcSectionItem[] = [
  { href: "/produksi/qc/checklist", label: "Checklist QC", desc: "Master checklist inspeksi ber-versi", icon: ListChecks, permission: "view_qc" },
  { href: "/produksi/qc/inspeksi", label: "Inspeksi", desc: "Catatan inspeksi penerimaan/proses/akhir", icon: ClipboardCheck, permission: "view_qc" },
  { href: "/produksi/qc/ncr", label: "Nonconformance (NCR)", desc: "Cacat, rework, dan penyelesaian", icon: AlertTriangle, permission: "view_qc" },
]
