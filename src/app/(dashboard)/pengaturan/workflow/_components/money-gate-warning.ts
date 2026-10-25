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

export type MoneyGateAction = "deactivate" | "delete"

export function moneyGateConfirmTitle(action: MoneyGateAction): string {
  return action === "delete" ? "Hapus workflow gerbang uang ini?" : "Nonaktifkan workflow gerbang uang ini?"
}

export function moneyGateConfirmBody(action: MoneyGateAction, modelType: string): string {
  const label = APPROVAL_MODEL_LABELS[modelType] || modelType
  const verb = action === "delete" ? "dihapus" : "dinonaktifkan"
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
