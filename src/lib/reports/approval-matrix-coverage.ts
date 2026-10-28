/**
 * Lapis aman 146-S — cakupan matriks approval (E146-1..3 dapat dihitung).
 *
 * Spec 146-S (merged c392d2cce) = PAKET PUTUSAN: isi matriks AM-01..AM-24
 * (WAJIB/OPSIONAL + ambang) milik owner via Q-AMX-1; Q-AMX-2/3/4 + putusan
 * Lead BR-APR-03/04/05 belum formal (putusan 18:40 WIB baru ratifikasi USULAN).
 * Builder ini TIDAK membekukan isi matriks: daftar WAJIB dipasok pemanggil.
 *
 * Pure (tanpa Prisma/DOM/migrasi). Fakta mesin yang dipakai (main live):
 * - requestApprovalIfConfigured no-op tanpa workflow aktif (M2/M3 fail-open);
 * - GATE_ONLY_REFERENCE_TYPES = {"Journal","VendorPayment"} (M4);
 * - kondisi langkah tidak dieksekusi (M10); peta 12 izin approval-permissions.
 * Yang TIDAK di sini (menunggu vonis formal): evaluasi conditions/ambang L2
 * (E146-4), fail-closed BR-AMX-01 (E146-1 MERAH-vs-OBSERVASI), SoD jalur
 * langsung PurchaseReturn/VendorBill, key izin baru, gate-only Quotation.
 * `ponytail:` tambah penegakan itu (fail-closed + conditions + SoD jalur
 * langsung) sesudah Q-AMX-1/3/4 + BR-APR-03/04/05 diputus formal.
 */

export interface ApprovalMatrixStepInput {
  roleId: number | null
  userId: number | null
}

export interface ApprovalMatrixWorkflowInput {
  modelType: string
  isActive: boolean
  /** Langkah workflow aktif berprioritas tertinggi; [] = tanpa langkah. */
  steps: readonly ApprovalMatrixStepInput[]
}

export interface ApprovalMatrixHistorySample {
  /** requested_by baris Approval; null = tak tercatat. */
  requestedBy: number | null
  /** Peny etuju langkah yang sama; null = tak tercatat. */
  approverId: number | null
}

export interface ApprovalMatrixCoverageRow {
  modelType: string
  /** true = baris WAJIB menurut daftar pemanggil; false = OPSIONAL. */
  required: boolean
  hasActiveWorkflow: boolean
  stepCount: number
  /** Langkah tanpa roleId DAN userId (E146-2; jatuh ke approve_workflows/admin). */
  emptyStepCount: number
  /** Sampel jejak requested_by = approver (E146-3, SoD mati; non-super_admin). */
  sodBreachCount: number
  /**
   * Fakta untuk E146-1: baris WAJIB tanpa workflow aktif. MERAH vs OBSERVASI
   * diputus pemanggil — MERAH hanya bila fail-closed BR-AMX-01 sudah diterima
   * (Q-AMX-4); sebelum itu catat OBSERVASI.
   */
  missingWorkflow: boolean
}

export function evaluateApprovalMatrixCoverage(
  requiredModelTypes: readonly string[],
  workflows: readonly ApprovalMatrixWorkflowInput[],
  historySamples: Readonly<Record<string, readonly ApprovalMatrixHistorySample[]>> = {},
): ApprovalMatrixCoverageRow[] {
  const required = new Set(requiredModelTypes)
  const universe = new Set<string>([...requiredModelTypes])
  for (const w of workflows) universe.add(w.modelType)
  return [...universe]
    .sort()
    .map((modelType): ApprovalMatrixCoverageRow => {
      const workflow = workflows.find((w) => w.modelType === modelType && w.isActive)
      const steps = workflow?.steps ?? []
      const samples = historySamples[modelType] ?? []
      return {
        modelType,
        required: required.has(modelType),
        hasActiveWorkflow: workflow !== undefined,
        stepCount: steps.length,
        emptyStepCount: steps.filter((s) => s.roleId === null && s.userId === null).length,
        sodBreachCount: samples.filter(
          (s) => s.requestedBy !== null && s.approverId !== null && s.requestedBy === s.approverId,
        ).length,
        missingWorkflow: required.has(modelType) && workflow === undefined,
      }
    })
}
