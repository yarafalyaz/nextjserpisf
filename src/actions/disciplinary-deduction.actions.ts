"use server"

/**
 * Pencatatan keputusan potongan disiplin BR-DISC-09 (F-2026-10-25-020-V).
 *
 * Memerintah jalur tulis service existing
 * `createDisciplinaryDeductionDecision` persis; guard builder/service
 * tidak diduplikasi di layer action. SP bukan pemicu potongan;
 * disciplinaryRecordId hanya konteks opsional. Penerapan ke payroll
 * (applyDisciplinaryDeduction) tetap domain payroll, bukan action ini.
 */

import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/auth/permissions"
import { assertHrEmployeeAccess, getHrScope } from "@/lib/auth/hr-scope"
import { prisma } from "@/lib/db/prisma"
import { isDisciplinaryDeductionKind } from "@/lib/reports/disciplinary-deduction"
import { logActivity } from "@/lib/services/activity-log.service"
import { createDisciplinaryDeductionDecision } from "@/lib/services/disciplinary-deduction.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"

const REVALIDATE = "/sdm/disiplin"

export interface CreateDisciplinaryDeductionDecisionInput {
  documentNo: string
  decidedAt: string
  employeeId: number
  disciplinaryRecordId?: number | null
  kind: string
  amount: number
  compensationAccountId?: number | null
  suspensionKind?: string | null
  suspensionPayTreatment?: string | null
  regulationReference?: string | null
  signedBy: number
}

type ActionResult = { success: true } | { success: false; error: string }

function fail(e: unknown, context: string): ActionResult {
  if (isNextRedirectError(e)) throw e
  console.error(`[${context}]`, e)
  return { success: false, error: getErrorMessage(e) }
}

function parseDateOnly(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} tidak valid`)
  const parsed = wibDateToUtcMidnight(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} tidak valid`)
  return parsed
}

function assertValidId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} tidak valid`)
}

function optionalId(value: number | null | undefined, label: string): number | null {
  if (value == null) return null
  assertValidId(value, label)
  return value
}

/**
 * Totale pencatatan keputusan BR-DISC-09.
 *
 * Guard amount di action hanya transport fail-closed (finite); nilai dan
 * pesan bisnis tetap divalidasi service existing. signedBy dan
 * disciplinaryRecordId diverifikasi server supaya penandatangan dan
 * konteks tidak menunjuk karyawan/SP yang tidak ada atau sudah terhapus.
 */
export async function createDisciplinaryDeductionDecisionAction(
  input: CreateDisciplinaryDeductionDecisionInput,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("create_disciplinary_records")
    const documentNo = (input.documentNo ?? "").trim()
    if (!documentNo) throw new Error("Nomor dokumen keputusan wajib diisi")
    const decidedAt = parseDateOnly(input.decidedAt, "Tanggal keputusan")
    assertValidId(input.employeeId, "Karyawan")
    if (!isDisciplinaryDeductionKind(input.kind)) {
      throw new Error("Jenis potongan disiplin tidak valid (hanya denda atau ganti rugi)")
    }
    if (!Number.isFinite(input.amount)) throw new Error("Nominal keputusan tidak valid")
    assertValidId(input.signedBy, "Pejabat penandatangan")
    const disciplinaryRecordId = optionalId(input.disciplinaryRecordId, "Rekod disiplin konteks")
    const compensationAccountId = optionalId(input.compensationAccountId, "Akun kompensasi")

    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, input.employeeId)
    if (disciplinaryRecordId != null) {
      const record = await prisma.employeeDisciplinaryRecord.findFirst({
        where: { id: disciplinaryRecordId, employeeId: input.employeeId, deletedAt: null },
        select: { id: true },
      })
      if (!record) {
        throw new Error("Rekod disiplin konteks tidak ditemukan untuk karyawan ini")
      }
    }

    const signer = await prisma.employee.findUnique({
      where: { id: input.signedBy },
      select: { id: true, deletedAt: true },
    })
    if (!signer || signer.deletedAt != null) {
      throw new Error("Pejabat penandatangan keputusan tidak ditemukan")
    }

    const created = await createDisciplinaryDeductionDecision(prisma, {
      documentNo,
      decidedAt,
      employeeId: input.employeeId,
      disciplinaryRecordId,
      kind: input.kind,
      amount: input.amount,
      compensationAccountId,
      suspensionKind: input.suspensionKind ?? null,
      suspensionPayTreatment: input.suspensionPayTreatment ?? null,
      regulationReference: input.regulationReference ?? null,
      signedBy: input.signedBy,
      createdBy: Number(user.id),
    })

    await logActivity(
      "create",
      "DisciplinaryDeductionDecision",
      created.id,
      "Mencatat dokumen keputusan potongan disiplin",
    )
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "createDisciplinaryDeductionDecisionAction")
  }
}
