"use server"

/**
 * Pencatatan keputusan potongan disiplin BR-DISC-09 (F-2026-10-25-020-V).
 *
 * Memerintah jalur tulis service existing
 * `createDisciplinaryDeductionDecision` persis; guard builder/service
 * tidak diduplikasi di layer action. SP bukan pemicu potongan;
 * disciplinaryRecordId hanya konteks opsional. Penerapan ke payroll
 * (applyDisciplinaryDeduction) tetap domain payroll, bukan action ini.
 *
 * Penerapan ke periode payroll = `applyDisciplinaryDeductionAction` di bawah
 * (jalur MANUAL dan eksplisit). Keputusan yang baru dicatat tetap belum
 * memotong apa pun sampai operator menerapkannya ke periode tertentu, jadi
 * UI tetap menampilkan peringatan (DISC09_NOT_APPLIED_WARNING) sampai
 * penerapan benar-benar tercatat.
 */

import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/auth/permissions"
import { assertHrEmployeeAccess, getHrScope } from "@/lib/auth/hr-scope"
import { prisma } from "@/lib/db/prisma"
import { isDisciplinaryDeductionKind } from "@/lib/reports/disciplinary-deduction"
import { logActivity } from "@/lib/services/activity-log.service"
import { applyDisciplinaryDeduction, createDisciplinaryDeductionDecision } from "@/lib/services/disciplinary-deduction.service"
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

function assertValidId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} tidak valid`)
}

function optionalId(value: number | null | undefined, label: string): number | null {
  if (value == null) return null
  assertValidId(value, label)
  return value
}

/** Parse "YYYY-MM-DD" WIB; guard bentuk string ditahan di action (transport). */
function parseDecidedAt(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Tanggal keputusan tidak valid")
  const parsed = wibDateToUtcMidnight(value)
  if (Number.isNaN(parsed.getTime())) throw new Error("Tanggal keputusan tidak valid")
  return parsed
}

/**
 * Pencatatan keputusan BR-DISC-09 (jalur tulis tunggal).
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
    const decidedAt = parseDecidedAt(input.decidedAt)
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
      select: { id: true, deletedAt: true, isActive: true, employmentEndedAt: true },
    })
    if (!signer || signer.deletedAt != null) {
      throw new Error("Pejabat penandatangan keputusan tidak ditemukan")
    }
    // Putaran 65: penandatangan nonaktif/berhenti tak boleh menandatangani
    // dokumen keputusan baru (preseden reviewer probation putaran sebelumnya).
    if (!signer.isActive || signer.employmentEndedAt != null) {
      throw new Error("Pejabat penandatangan keputusan tidak aktif atau sudah berhenti bekerja")
    }

    // Putaran 65: subjek nonaktif/berhenti tak boleh menerima keputusan
    // baru. Gerbang sama dinilai ulang di service create; di sini fail-fast
    // sebelum service dipanggil.
    const subject = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, deletedAt: true, isActive: true, employmentEndedAt: true },
    })
    if (!subject || subject.deletedAt != null) {
      throw new Error("Karyawan pada dokumen keputusan tidak ditemukan")
    }
    if (!subject.isActive || subject.employmentEndedAt != null) {
      throw new Error("Karyawan pada dokumen keputusan tidak aktif atau sudah berhenti bekerja")
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

export interface ApplyDisciplinaryDeductionActionInput {
  decisionId: number
  /** Periode payroll "YYYY-MM". */
  period: string
  /** Upah pembayaran periode ini (dasar plafon 50% BR-DISC-09). */
  periodPay: number
  /** Tanggal transaksi jurnal, "YYYY-MM-DD" WIB. */
  transactionDate: string
}

/**
 * Terapkan satu keputusan potongan disiplin ke periode payroll tertentu.
 *
 * Inilah pemicu yang sebelumnya tidak ada: `applyDisciplinaryDeduction` sudah
 * lengkap (plafon 50%, lock karyawan, idempotensi per keputusan+periode,
 * jurnal Dr Hutang Gaji / Cr Denda atau akun kompensasi, periode fail-closed)
 * tetapi nol pemanggil produksi, sehingga keputusan tercatat tanpa memotong
 * apa pun. Action ini adalah jalur manual yang eksplisit: operator memilih
 * periode dan upah pembayaran, lalu potongan diposting sebagai jurnal
 * tersendiri (BUKAN lewat `payroll.deductions`, supaya jurnal denda tidak
 * dobel dengan kredit Hutang Gaji yang sudah dibuat `onPayrollPaid`).
 *
 * Idempotensi: service memakai kunci (keputusan, periode, jenis); klik ganda
 * mengembalikan hasil awal tanpa jurnal baru.
 */
export async function applyDisciplinaryDeductionAction(
  input: ApplyDisciplinaryDeductionActionInput,
): Promise<ActionResult & { journalId?: number | null; amount?: number; replayed?: boolean }> {
  try {
    const user = await requirePermission("process_payroll")
    assertValidId(input.decisionId, "Keputusan potongan")

    if (!/^\d{4}-\d{2}$/.test(input.period ?? "")) {
      return { success: false, error: "Periode wajib berformat YYYY-MM." }
    }
    const periodPay = Number(input.periodPay)
    if (!Number.isFinite(periodPay) || periodPay <= 0) {
      return { success: false, error: "Upah pembayaran periode ini wajib lebih dari 0." }
    }
    const transactionDate = parseDecidedAt(input.transactionDate)

    const decision = await prisma.disciplinaryDeductionDecision.findUnique({
      where: { id: input.decisionId },
      select: { id: true, employeeId: true, deletedAt: true },
    })
    if (!decision || decision.deletedAt) {
      return { success: false, error: "Dokumen keputusan potongan disiplin tidak ditemukan." }
    }

    // Cakupan HR: pemegang process_payroll ber-scope department hanya boleh
    // menerapkan potongan untuk karyawan dalam cakupannya.
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, decision.employeeId)

    const result = await applyDisciplinaryDeduction(prisma, {
      decisionId: input.decisionId,
      period: input.period,
      periodPay,
      transactionDate,
      createdBy: Number(user.id) || null,
    })

    revalidatePath(REVALIDATE)
    await logActivity(
      result.replayed ? "view" : "create",
      "DisciplinaryDeductionApplication",
      result.applicationId,
      result.replayed
        ? `Penerapan potongan disiplin periode ${input.period} sudah ada (tidak ada jurnal baru)`
        : `Potongan disiplin periode ${input.period} diterapkan Rp${result.amount}`,
    )

    return {
      success: true,
      journalId: result.journalId,
      amount: result.amount,
      replayed: result.replayed,
    }
  } catch (e: unknown) {
    return fail(e, "applyDisciplinaryDeductionAction")
  }
}
