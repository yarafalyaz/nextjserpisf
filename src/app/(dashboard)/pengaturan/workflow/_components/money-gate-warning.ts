import { APPROVAL_MODEL_LABELS } from "@/lib/constants/approval"

/**
 * Tipe workflow gerbang uang (vonis F-2026-10-25-014-V K4-S2(b)).
 * Selaras MONEY_GATE_MODEL_TYPES di src/actions/approval.actions.ts:
 * menonaktifkan/menghapus workflow tipe ini mematikan gerbang persetujuan
 * dokumen uang, jadi UI wajib meminta konfirmasi sadar lebih dulu.
 */
const MONEY_GATE_MODEL_TYPES: ReadonlySet<string> = new Set(["Journal", "VendorPayment"])

export function isMoneyGateModelType(modelType: string | null | undefined): boolean {
  return !!modelType && MONEY_GATE_MODEL_TYPES.has(modelType)
}

export type MoneyGateAction = "deactivate" | "delete" | "retype"

export function moneyGateConfirmTitle(action: MoneyGateAction): string {
  if (action === "delete") return "Hapus workflow gerbang uang ini?"
  if (action === "retype") return "Ganti tipe workflow gerbang uang ini?"
  return "Nonaktifkan workflow gerbang uang ini?"
}

export function moneyGateConfirmBody(action: MoneyGateAction, modelType: string, newModelType?: string): string {
  const label = APPROVAL_MODEL_LABELS[modelType] || modelType
  const verb = action === "delete" ? "dihapus" : action === "retype" ? `tipe dokumennya diganti ke ${APPROVAL_MODEL_LABELS[newModelType ?? ""] || newModelType || "tipe lain"}` : "dinonaktifkan"
  const doc =
    modelType === "VendorPayment"
      ? "Pembayaran vendor bisa dikonfirmasi dan diposting tanpa persetujuan"
      : "Jurnal manual bisa diposting tanpa persetujuan"
  return `Workflow ini adalah gerbang persetujuan untuk ${label}. Bila workflow ${verb}, gerbang uang mati: ${doc} sampai workflow aktif pengganti dibuat. Lanjutkan hanya bila Anda memang bermaksud membuka gerbang ini.`
}

export function moneyGateInlineWarning(modelType: string): string {
  const label = APPROVAL_MODEL_LABELS[modelType] || modelType
  return `Peringatan gerbang uang: menonaktifkan workflow ${label} ini mematikan gerbang persetujuan. Dokumen uang terkait bisa diposting tanpa persetujuan sampai workflow aktif pengganti dibuat. Anda akan diminta konfirmasi sebelum menyimpan.`
}

export function moneyGateRetypeWarning(modelType: string, newModelType: string): string {
  const label = APPROVAL_MODEL_LABELS[modelType] || modelType
  const nextLabel = APPROVAL_MODEL_LABELS[newModelType] || newModelType
  return `Peringatan gerbang uang: mengganti tipe workflow ${label} menjadi ${nextLabel} mematikan gerbang persetujuan ${label}. Dokumen uang terkait bisa diposting tanpa persetujuan sampai workflow aktif pengganti dibuat. Anda akan diminta konfirmasi sebelum menyimpan.`
}
