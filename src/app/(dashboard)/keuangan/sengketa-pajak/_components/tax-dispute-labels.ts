import {
  TAX_DISPUTE_PASAL36_SUBKINDS,
  TAX_DISPUTE_REGISTER_COLUMN_LABELS,
  TAX_DISPUTE_REGISTER_TITLE,
  TAX_DISPUTE_LATE_FLAG,
  type TaxDisputeAssessmentRow,
  type TaxDisputeRegisterQueue,
} from "@/lib/reports/tax-dispute-register-queue"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"

export const TAX_DISPUTE_ASSESSMENT_KIND_LABELS: Record<string, string> = {
  SKPKB: "SKPKB",
  SKPKBT: "SKPKBT",
  SKPLB: "SKPLB",
  SKPN: "SKPN",
  PEMUNGUTAN_PIHAK_KETIGA: "Pemungutan Pihak Ketiga",
}

export const TAX_DISPUTE_STEP_KIND_LABELS: Record<string, string> = {
  KEBERATAN: "Keberatan",
  PENGURANGAN_PEMBATALAN: "Pengurangan/Pembatalan (Pasal 36)",
  BANDING: "Banding",
  GUGATAN: "Gugatan",
  PENINJAUAN_KEMBALI: "Peninjauan Kembali",
}

export const TAX_DISPUTE_PASAL36_SUBKIND_LABELS: Record<string, string> = {
  SANKSI_KURANG_HAPUS: "Sanksi kurang bayar dihapuskan",
  SKP_KURANG_BATAL: "SKP kurang bayar dibatalkan",
  STP_KURANG_BATAL: "STP kurang bayar dibatalkan",
  BATAL_DEMI_HUKUM: "Batal demi hukum",
} satisfies Record<(typeof TAX_DISPUTE_PASAL36_SUBKINDS)[number], string>

export function taxDisputeAssessmentKindLabel(kind: string | null | undefined): string {
  if (!kind) return "-"
  return TAX_DISPUTE_ASSESSMENT_KIND_LABELS[kind] ?? kind
}

export function taxDisputeStatusLabel(status: string | null | undefined): string {
  return statusLabel(status ?? null)
}

export type { TaxDisputeAssessmentRow, TaxDisputeRegisterQueue }
export {
  TAX_DISPUTE_REGISTER_TITLE,
  TAX_DISPUTE_REGISTER_COLUMN_LABELS,
  TAX_DISPUTE_LATE_FLAG,
  formatCurrency,
  formatDate,
}
