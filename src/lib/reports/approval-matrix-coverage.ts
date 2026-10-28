/**
 * F-2026-10-28-146-S lapis aman — cakupan matriks approval (E146-1..3 dapat dihitung).
 *
 * Builder MURNI (tanpa Prisma/DOM): `evaluateApprovalMatrixCoverage(config, required)`
 * menilai cakupan workflow approval per `modelType` dari data yang dipasok
 * pemanggil. Daftar model WAJIB dipasok sebagai argumen `required` — builder
 * TIDAK membekukan konstanta isi matriks (isi matriks = data owner/Lead,
 * bukan kode; keputusan 9 di KEPUTUSAN-TERVERIFIKASI.md + Q-AMX-1).
 *
 * Pemetaan acceptance:
 * - E146-1: baris WAJIB tanpa workflow aktif (atau workflow aktif tanpa
 *   langkah) → `hasActiveWorkflow=false` / observasi M2, bukan MERAH di sini
 *   (MERAH hanya bila BR-AMX-01 fail-closed diterima; sebelum itu OBSERVASI).
 * - E146-2: langkah tanpa `roleId` DAN `userId` → `stepsFilled=false` +
 *   observasi (persetujuan jatuh ke `approve_workflows` = admin saja).
 * - E146-3: `requested_by` tercatat sebagai approver langkah yang sama →
 *   `approverIsRequester=true` + observasi SoD (dari jejak approvals bila
 *   dipasok; tanpa jejak = false, bukan tuduhan).
 * - Observasi fail-open M2/M3 (mekanisme TERVERIFIKASI-KODE di 146-S):
 *   M2 = tanpa workflow aktif `requestApprovalIfConfigured` no-op
 *   (`approval-workflow.service.ts:33-39`); M3 = tanpa baris `Approval`
 *   `assertApproved` lolos (`:58-64`).
 *
 * BUKAN lingkup: evaluasi `conditions`/ambang L2, fail-closed BR-AMX-01,
 * gate-only Quotation, key izin baru, SoD jalur langsung, loader DB, UI.
 */

export interface CoverageStepInput {
  roleId: number | null
  userId: number | null
}

export interface CoverageWorkflowInput {
  modelType: string
  isActive: boolean
  deletedAt?: Date | null
  steps: CoverageStepInput[]
}

export interface CoverageApprovalHistoryInput {
  userId: number | null
}

export interface CoverageApprovalInput {
  referenceType: string
  referenceId: number
  status: string
  requestedBy: number | null
  histories: CoverageApprovalHistoryInput[]
}

export interface ApprovalMatrixCoverageConfig {
  workflows: CoverageWorkflowInput[]
  /** Jejak approvals opsional — hanya untuk E146-3 (SoD). Tanpa jejak = false. */
  approvals?: CoverageApprovalInput[]
}

export interface ApprovalMatrixCoverageRow {
  modelType: string
  /** Ada ≥1 workflow aktif (belum dihapus) untuk model ini. */
  hasActiveWorkflow: boolean
  /** Tiap langkah workflow aktif ada roleId ATAU userId (E146-2). */
  stepsFilled: boolean
  activeWorkflowCount: number
  activeStepCount: number
  emptyStepCount: number
  /** requested_by tercatat sebagai approver (E146-3, dari jejak bila ada). */
  approverIsRequester: boolean
  /** Observasi fail-open M2/M3 + sel E146 — kata tetap, UI menempel apa adanya. */
  observasi: string[]
}

export interface ApprovalMatrixCoverage {
  rows: ApprovalMatrixCoverageRow[]
  totalWajib: number
  terisi: number
  tanpaWorkflow: number
  langkahKosong: number
  sodTeramati: number
}

export const APPROVAL_MATRIX_M2_OBSERVASI =
  "M2: tanpa workflow aktif — permintaan approval no-op, dokumen jalan tanpa gerbang"

export const APPROVAL_MATRIX_M3_OBSERVASI =
  "M3: tanpa baris Approval — gerbang assertApproved lolos (fail-open hari ini)"

export const APPROVAL_MATRIX_EMPTY_STEP_OBSERVASI =
  "E146-2: langkah tanpa roleId dan userId — persetujuan jatuh ke approve_workflows (admin saja)"

export const APPROVAL_MATRIX_SOD_OBSERVASI =
  "E146-3: requested_by tercatat sebagai approver — SoD mati pada dokumen ini"

export const APPROVAL_MATRIX_NO_STEP_OBSERVASI =
  "E146-1: workflow aktif tanpa langkah — tidak ada tingkat persetujuan terisi"

export function evaluateApprovalMatrixCoverage(
  config: ApprovalMatrixCoverageConfig,
  required: string[],
): ApprovalMatrixCoverage {
  const activeByModel = new Map<string, CoverageStepInput[]>()
  for (const w of config.workflows) {
    if (!w.isActive || w.deletedAt != null) continue
    const bucket = activeByModel.get(w.modelType) ?? []
    for (const s of w.steps) bucket.push(s)
    activeByModel.set(w.modelType, bucket)
  }

  const approverByKey = new Map<string, Set<number>>()
  for (const a of config.approvals ?? []) {
    if (a.requestedBy == null) continue
    const acted = (a.histories ?? []).some((h) => h.userId != null && h.userId === a.requestedBy)
    if (!acted) continue
    const key = `${a.referenceType}#${a.referenceId}`
    const set = approverByKey.get(key) ?? new Set<number>()
    set.add(a.requestedBy)
    approverByKey.set(key, set)
  }
  const sodModels = new Set<string>()
  for (const [key, requesters] of approverByKey) {
    if (requesters.size === 0) continue
    sodModels.add(key.slice(0, key.lastIndexOf("#")))
  }

  const rows: ApprovalMatrixCoverageRow[] = required.map((modelType) => {
    const steps = activeByModel.get(modelType) ?? []
    const active = activeByModel.has(modelType)
    const emptyStepCount = steps.filter((s) => s.roleId == null && s.userId == null).length
    const stepsFilled = active && steps.length > 0 && emptyStepCount === 0
    const approverIsRequester = sodModels.has(modelType)
    const observasi: string[] = []
    if (!active) {
      observasi.push(APPROVAL_MATRIX_M2_OBSERVASI)
      observasi.push(APPROVAL_MATRIX_M3_OBSERVASI)
    } else if (steps.length === 0) {
      observasi.push(APPROVAL_MATRIX_NO_STEP_OBSERVASI)
    }
    if (emptyStepCount > 0) observasi.push(APPROVAL_MATRIX_EMPTY_STEP_OBSERVASI)
    if (approverIsRequester) observasi.push(APPROVAL_MATRIX_SOD_OBSERVASI)
    return {
      modelType,
      hasActiveWorkflow: active,
      stepsFilled,
      activeWorkflowCount: active
        ? config.workflows.filter((w) => w.modelType === modelType && w.isActive && w.deletedAt == null).length
        : 0,
      activeStepCount: steps.length,
      emptyStepCount,
      approverIsRequester,
      observasi,
    }
  })

  return {
    rows,
    totalWajib: rows.length,
    terisi: rows.filter((r) => r.hasActiveWorkflow && r.stepsFilled && !r.approverIsRequester).length,
    tanpaWorkflow: rows.filter((r) => !r.hasActiveWorkflow).length,
    langkahKosong: rows.filter((r) => r.hasActiveWorkflow && !r.stepsFilled).length,
    sodTeramati: rows.filter((r) => r.approverIsRequester).length,
  }
}
