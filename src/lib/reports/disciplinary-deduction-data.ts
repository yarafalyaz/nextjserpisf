/**
 * Loader baca snapshot keputusan potongan disiplin BR-DISC-09
 * (F-2026-10-25-020-V, kontrak Backend PR #950).
 *
 * Snapshot dokumen keputusan manusia ditampilkan APA ADANYA: nominal,
 * jenis, perlakuan upah skorsing, dan dasar peraturan adalah snapshot
 * tersimpan — loader dan UI tidak menghitung ulang, tidak menurunkan
 * status, dan tidak membaca rekod SP sebagai pemicu (disciplinaryRecordId
 * hanya tautan konteks).
 *
 * Gating nominal di SERVER: amount hanya dimuat bila pemanggil berizin
 * `view_payroll`. Tanpa izin itu payload tidak memuat nominal sama sekali
 * — bukan disembunyikan di client.
 *
 * Scope HR pemanggil diterapkan pada query yang sama lewat hrScopeWhere
 * existing (fail-closed, pola disciplinary-data.ts).
 */

import { prisma } from "@/lib/db/prisma"
import { hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"

export interface DisciplinaryDeductionDecisionRow {
  id: number
  documentNo: string
  decidedAt: Date
  employeeId: number
  employeeName: string
  departmentName: string | null
  disciplinaryRecordId: number | null
  /** Konteks saja — nomor dokumen SP terkait; SP bukan pemicu potongan. */
  contextDocumentNo: string | null
  kind: string
  /** Snapshot nominal keputusan; null = pemanggil tanpa izin nominal. */
  amount: number | null
  compensationAccountLabel: string | null
  suspensionKind: string | null
  suspensionPayTreatment: string | null
  regulationReference: string | null
  signerName: string
}

const DECISION_SELECT = {
  id: true,
  documentNo: true,
  decidedAt: true,
  employeeId: true,
  disciplinaryRecordId: true,
  kind: true,
  amount: true,
  suspensionKind: true,
  suspensionPayTreatment: true,
  regulationReference: true,
  employee: { select: { name: true, department: { select: { name: true } } } },
  signer: { select: { name: true } },
  disciplinaryRecord: { select: { documentNo: true } },
  compensationAccount: { select: { code: true, name: true } },
} as const

type DecisionDbRow = {
  id: number
  documentNo: string
  decidedAt: Date
  employeeId: number
  disciplinaryRecordId: number | null
  kind: string
  amount: unknown
  suspensionKind: string | null
  suspensionPayTreatment: string | null
  regulationReference: string | null
  employee: { name: string; department: { name: string } | null }
  signer: { name: string }
  disciplinaryRecord: { documentNo: string | null } | null
  compensationAccount: { code: string; name: string } | null
}

function toRow(r: DecisionDbRow, canViewAmount: boolean): DisciplinaryDeductionDecisionRow {
  return {
    id: r.id,
    documentNo: r.documentNo,
    decidedAt: r.decidedAt,
    employeeId: r.employeeId,
    employeeName: r.employee.name,
    departmentName: r.employee.department?.name ?? null,
    disciplinaryRecordId: r.disciplinaryRecordId,
    contextDocumentNo: r.disciplinaryRecord?.documentNo ?? null,
    kind: r.kind,
    amount: canViewAmount ? Number(r.amount) : null,
    compensationAccountLabel: r.compensationAccount
      ? `${r.compensationAccount.code} — ${r.compensationAccount.name}`
      : null,
    suspensionKind: r.suspensionKind,
    suspensionPayTreatment: r.suspensionPayTreatment,
    regulationReference: r.regulationReference,
    signerName: r.signer.name,
  }
}

async function queryDecisions(
  scope: HrScope,
  canViewAmount: boolean,
  extraWhere: Record<string, unknown>,
): Promise<DisciplinaryDeductionDecisionRow[]> {
  const rows = await prisma.disciplinaryDeductionDecision.findMany({
    where: { deletedAt: null, ...hrScopeWhere(scope), ...extraWhere },
    select: DECISION_SELECT,
    orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
  })
  return (rows as DecisionDbRow[]).map((r) => toRow(r, canViewAmount))
}

/** Semua keputusan potongan dalam scope HR pemanggil. */
export async function loadDisciplinaryDeductionDecisions(
  scope: HrScope,
  canViewAmount: boolean,
): Promise<DisciplinaryDeductionDecisionRow[]> {
  return queryDecisions(scope, canViewAmount, {})
}

/** Keputusan yang menautkan satu rekod SP sebagai konteks (bukan pemicu). */
export async function loadDisciplinaryDeductionDecisionsForRecord(
  scope: HrScope,
  disciplinaryRecordId: number,
  canViewAmount: boolean,
): Promise<DisciplinaryDeductionDecisionRow[]> {
  return queryDecisions(scope, canViewAmount, { disciplinaryRecordId })
}
