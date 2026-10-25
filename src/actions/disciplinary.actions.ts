"use server"

/**
 * Aksi rekod disiplin karyawan (F-2026-10-25-005-S DISC-B1, putusan Lead
 * Q-DISC-1..4 2026-10-25). Penjaga murni hidup di
 * src/lib/reports/disciplinary.ts; berkas ini hanya orkestrasi server:
 * izin -> scope -> muat fakta -> penjaga -> klaim transisi atomik ->
 * ActivityLog -> revalidate. Jenjang TIDAK dipilih bebas: dihitung ulang
 * dari rekod issued aktif pada violationDate di dalam transaksi
 * (BR-DISC-04). Tanpa nominal/gaji (BR-DISC-08), tanpa jalur berhenti
 * (BR-DISC-09) — SP3/first-final aktif hanya menandai kajian berhenti.
 *
 * Izin (Q-DISC-2): view/create/approve_disciplinary_records khusus.
 * SoD (BR-DISC-06): penyetuju != pengaju (Employee id); SP3 &
 * sp_first_final wajib penyetuju kedua berbeda dari keduanya.
 * Tanggapan karyawan (Q-DISC-3): jendela 7 hari kalender dari issuedAt
 * lewat jalur self-service; lewat jendela ditolak — HR menempelkan
 * tanggapan terlambat berlabel employeeResponseLate lewat aksi HR.
 * Koreksi rekod issued (Q-DISC-4/BR-DISC-10): immutable isi; pembatalan
 * hanya lewat rekod pembatal tertaut (voidOfId) + voidedAt di rekod asal.
 */

import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/auth/permissions"
import { assertHrEmployeeAccess, getHrScope, type HrScope } from "@/lib/auth/hr-scope"
import { prisma } from "@/lib/db/prisma"
import { logActivity } from "@/lib/services/activity-log.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import {
  deriveNextDisciplinaryLevel,
  disciplinaryLevelLabel,
  evaluateDisciplinaryApprovalSod,
  evaluateDisciplinaryEmployeeResponse,
  evaluateDisciplinaryRejection,
  evaluateDisciplinaryResponseWindow,
  evaluateFirstFinalDisciplinary,
  evaluateRequestedDisciplinaryLevel,
  isDisciplinaryLevel,
  isDisciplinaryViolationCategory,
  DISCIPLINARY_SEVERE_CATEGORIES,
  type DisciplinaryLevel,
  type DisciplinaryRecordLike,
} from "@/lib/reports/disciplinary"

const REVALIDATE = "/master/karyawan"

type ActionResult = { success: true } | { success: false; error: string }

function fail(e: unknown, context: string): ActionResult {
  if (isNextRedirectError(e)) throw e
  console.error(`[${context}]`, e)
  return { success: false, error: getErrorMessage(e) }
}

/** Klaim transisi atomik + jejak + revalidasi (pola berulang semua aksi). */
async function claimTransition(
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  conflictMessage: string,
  action: string,
  recordId: number,
  description: string,
): Promise<ActionResult> {
  const claim = await prisma.employeeDisciplinaryRecord.updateMany({
    where: { id: recordId, deletedAt: null, ...where },
    data,
  })
  if (claim.count === 0) throw new Error(conflictMessage)
  await logActivity(action, "EmployeeDisciplinaryRecord", recordId, description)
  revalidatePath(REVALIDATE)
  return { success: true }
}

function parseDateOnly(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} tidak valid`)
  const parsed = wibDateToUtcMidnight(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} tidak valid`)
  return parsed
}

function requireText(value: string | null | undefined, message: string): string {
  const clean = (value ?? "").trim()
  if (!clean) throw new Error(message)
  return clean
}

function assertValidId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} tidak valid`)
}

/** Employee id user pemanggil (identitas SoD = Employee, bukan userId). */
async function callerEmployeeId(userId: string): Promise<number | null> {
  const me = await prisma.employee.findFirst({
    where: { userId: Number(userId) },
    select: { id: true },
  })
  return me?.id ?? null
}

async function assertEmployeeUsable(employeeId: number): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, deletedAt: true },
  })
  if (!employee || employee.deletedAt != null) throw new Error("Karyawan tidak ditemukan")
}

/** Rekod issued karyawan untuk rantai jenjang (pembatal dikecualikan builder). */
async function loadChainRecords(
  client: Pick<typeof prisma, "employeeDisciplinaryRecord">,
  employeeId: number,
): Promise<DisciplinaryRecordLike[]> {
  const rows = await client.employeeDisciplinaryRecord.findMany({
    where: { employeeId, workflowStatus: "issued", deletedAt: null },
    select: {
      id: true,
      employeeId: true,
      level: true,
      workflowStatus: true,
      violationDate: true,
      issuedAt: true,
      voidedAt: true,
    },
    orderBy: [{ id: "asc" }],
  })
  return rows
    .filter((r) => isDisciplinaryLevel(r.level))
    .map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      level: r.level as DisciplinaryLevel,
      workflowStatus: "issued" as const,
      violationDate: r.violationDate,
      issuedAt: r.issuedAt,
      voidedAt: r.voidedAt,
    }))
}

const RECORD_SELECT = {
  id: true,
  employeeId: true,
  level: true,
  violationCategory: true,
  violationDate: true,
  description: true,
  workflowStatus: true,
  requestedBy: true,
  approvedBy: true,
  secondApprovedBy: true,
  issuedAt: true,
  deletedAt: true,
} as const

async function loadRecord(recordId: number) {
  const record = await prisma.employeeDisciplinaryRecord.findUnique({
    where: { id: recordId },
    select: RECORD_SELECT,
  })
  if (!record || record.deletedAt != null) throw new Error("Rekod disiplin tidak ditemukan")
  return record
}

/* ------------------------------------------------------------------ */
/* Pengajuan                                                           */
/* ------------------------------------------------------------------ */

export interface DisciplinaryRecordFormInput {
  employeeId: number
  level: string
  violationCategory: string
  violationDate: string
  description: string
  regulationReference: string | null
}

function validateFormInput(input: DisciplinaryRecordFormInput) {
  assertValidId(input.employeeId, "Karyawan")
  if (!isDisciplinaryViolationCategory(input.violationCategory)) {
    throw new Error("Kategori pelanggaran tidak terdaftar (Q-DISC-1)")
  }
  if (!isDisciplinaryLevel(input.level) || input.level === "verbal") {
    throw new Error("Jenjang peringatan tidak valid")
  }
  return {
    violationDate: parseDateOnly(input.violationDate, "Tanggal kejadian"),
    description: requireText(input.description, "Uraian pelanggaran wajib diisi"),
  }
}

/** Jenjang sah saat ini + penjaga kategori berat untuk sp_first_final. */
function assertLevelAllowed(
  records: DisciplinaryRecordLike[],
  employeeId: number,
  violationDate: Date,
  level: string,
  violationCategory: string,
): void {
  if (level === "sp_first_final") {
    const guard = evaluateFirstFinalDisciplinary({
      violationCategory,
      severeCategories: DISCIPLINARY_SEVERE_CATEGORIES,
    })
    if (!guard.allowed) throw new Error(guard.message)
    // SP pertama-dan-terakhir di luar rantai SP1..SP3: hanya ditolak bila
    // rantai sudah mencapai kajian berhenti.
    const derived = deriveNextDisciplinaryLevel(records, employeeId, violationDate)
    if (derived.kind === "review_termination") {
      throw new Error(
        "Karyawan masih dalam masa berlaku SP3/SP pertama dan terakhir; pelanggaran baru tidak diterbitkan sebagai SP baru dan diteruskan sebagai kajian berhenti",
      )
    }
    return
  }
  const guard = evaluateRequestedDisciplinaryLevel({
    records,
    employeeId,
    violationDate,
    requestedLevel: level,
  })
  if (!guard.allowed) throw new Error(guard.message)
}

export async function createDisciplinaryRecord(
  input: DisciplinaryRecordFormInput,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("create_disciplinary_records")
    const { violationDate, description } = validateFormInput(input)
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, input.employeeId)
    if (scope.kind === "self") {
      throw new Error("Anda tidak dapat mengajukan peringatan untuk diri sendiri")
    }
    await assertEmployeeUsable(input.employeeId)
    const me = await callerEmployeeId(user.id)
    if (me == null) throw new Error("Akun Anda tidak terhubung ke data karyawan")
    if (me === input.employeeId) {
      throw new Error("Pengaju tidak boleh mengajukan peringatan untuk diri sendiri")
    }

    const records = await loadChainRecords(prisma, input.employeeId)
    assertLevelAllowed(records, input.employeeId, violationDate, input.level, input.violationCategory)

    const created = await prisma.employeeDisciplinaryRecord.create({
      data: {
        employeeId: input.employeeId,
        level: input.level,
        violationCategory: input.violationCategory,
        violationDate,
        description,
        regulationReference: input.regulationReference?.trim() || null,
        workflowStatus: "draft",
        requestedBy: me,
        createdBy: Number(user.id),
      },
      select: { id: true },
    })
    await logActivity(
      "create",
      "EmployeeDisciplinaryRecord",
      created.id,
      `Membuat pengajuan peringatan ${disciplinaryLevelLabel(input.level) ?? input.level}`,
    )
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "createDisciplinaryRecord")
  }
}

export async function submitDisciplinaryRecord(recordId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("create_disciplinary_records")
    assertValidId(recordId, "Rekod disiplin")
    const record = await loadRecord(recordId)
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, record.employeeId)
    if (record.workflowStatus !== "draft") {
      throw new Error("Pengajuan hanya dapat diajukan dari status draft")
    }
    const me = await callerEmployeeId(user.id)
    if (me == null || me !== record.requestedBy) {
      throw new Error("Hanya pengaju yang dapat mengajukan pengajuan ini")
    }

    // BR-DISC-04 + edge dua pengajuan bersamaan: jenjang dihitung ulang
    // di dalam transaksi sebelum klaim transisi.
    await prisma.$transaction(async (tx) => {
      const records = await loadChainRecords(tx, record.employeeId)
      assertLevelAllowed(
        records,
        record.employeeId,
        record.violationDate,
        record.level,
        record.violationCategory,
      )
      const claim = await tx.employeeDisciplinaryRecord.updateMany({
        where: { id: recordId, workflowStatus: "draft", deletedAt: null },
        data: { workflowStatus: "pending_approval" },
      })
      if (claim.count === 0) throw new Error("Pengajuan hanya dapat diajukan dari status draft")
    })
    await logActivity("submit", "EmployeeDisciplinaryRecord", recordId, "Mengajukan peringatan untuk persetujuan")
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "submitDisciplinaryRecord")
  }
}

/* ------------------------------------------------------------------ */
/* Persetujuan & penerbitan                                            */
/* ------------------------------------------------------------------ */

async function assertApprover(
  user: { id: string; roles: string[] },
  record: { employeeId: number; requestedBy: number },
): Promise<{ scope: HrScope; me: number }> {
  const scope = await getHrScope(user)
  await assertHrEmployeeAccess(scope, record.employeeId)
  const me = await callerEmployeeId(user.id)
  if (me == null) throw new Error("Akun Anda tidak terhubung ke data karyawan")
  if (me === record.requestedBy) {
    throw new Error("Penyetuju tidak boleh menyetujui pengajuan peringatan yang diajukan sendiri")
  }
  return { scope, me }
}

export async function approveDisciplinaryRecord(recordId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("approve_disciplinary_records")
    assertValidId(recordId, "Rekod disiplin")
    const record = await loadRecord(recordId)
    if (record.workflowStatus !== "pending_approval") {
      throw new Error("Pengajuan hanya dapat disetujui dari status menunggu persetujuan")
    }
    if (!isDisciplinaryLevel(record.level)) throw new Error("Jenjang peringatan tidak valid")
    const { me } = await assertApprover(user, record)
    const level = record.level as DisciplinaryLevel
    const needsSecond = level === "sp3" || level === "sp_first_final"
    const now = new Date()

    if (!needsSecond) {
      const sod = evaluateDisciplinaryApprovalSod({
        level,
        requestedByEmployeeId: record.requestedBy,
        approverEmployeeId: me,
        secondApproverEmployeeId: null,
      })
      if (!sod.allowed) throw new Error(sod.message)
      const documentNo = await generateDocumentNumber("SP")
      const claim = await prisma.employeeDisciplinaryRecord.updateMany({
        where: { id: recordId, workflowStatus: "pending_approval", deletedAt: null },
        data: {
          workflowStatus: "issued",
          approvedBy: me,
          approvedAt: now,
          issuedAt: now,
          documentNo,
        },
      })
      if (claim.count === 0) {
        throw new Error("Pengajuan hanya dapat disetujui dari status menunggu persetujuan")
      }
    } else if (record.approvedBy == null) {
      // Persetujuan pertama SP3/first-final: catat penyetuju pertama,
      // rekod tetap pending_approval menunggu penyetuju kedua.
      const claim = await prisma.employeeDisciplinaryRecord.updateMany({
        where: { id: recordId, workflowStatus: "pending_approval", approvedBy: null, deletedAt: null },
        data: { approvedBy: me, approvedAt: now },
      })
      if (claim.count === 0) throw new Error("Persetujuan pertama sudah tercatat")
    } else {
      const sod = evaluateDisciplinaryApprovalSod({
        level,
        requestedByEmployeeId: record.requestedBy,
        approverEmployeeId: record.approvedBy,
        secondApproverEmployeeId: me,
      })
      if (!sod.allowed) throw new Error(sod.message)
      // Jenjang dihitung ulang sesaat sebelum terbit (rantai bisa berubah
      // sejak pengajuan diajukan).
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.employeeDisciplinaryRecord.findUnique({
          where: { id: recordId },
          select: RECORD_SELECT,
        })
        if (!fresh || fresh.workflowStatus !== "pending_approval" || fresh.approvedBy == null) {
          throw new Error("Pengajuan hanya dapat diterbitkan sesudah persetujuan pertama tercatat")
        }
        const records = await loadChainRecords(tx, fresh.employeeId)
        assertLevelAllowed(
          records,
          fresh.employeeId,
          fresh.violationDate,
          fresh.level,
          fresh.violationCategory,
        )
        const documentNo = await generateDocumentNumber("SP")
        const claim = await tx.employeeDisciplinaryRecord.updateMany({
          where: { id: recordId, workflowStatus: "pending_approval", deletedAt: null },
          data: {
            workflowStatus: "issued",
            secondApprovedBy: me,
            secondApprovedAt: now,
            issuedAt: now,
            documentNo,
          },
        })
        if (claim.count === 0) {
          throw new Error("Pengajuan hanya dapat disetujui dari status menunggu persetujuan")
        }
      })
    }
    await logActivity("approve", "EmployeeDisciplinaryRecord", recordId, "Menyetujui pengajuan peringatan")
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "approveDisciplinaryRecord")
  }
}

export async function rejectDisciplinaryRecord(
  recordId: number,
  reason: string,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("approve_disciplinary_records")
    assertValidId(recordId, "Rekod disiplin")
    const guard = evaluateDisciplinaryRejection({ reason })
    if (!guard.allowed) throw new Error(guard.message)
    const record = await loadRecord(recordId)
    await assertApprover(user, record)
    if (record.workflowStatus !== "pending_approval") {
      throw new Error("Pengajuan hanya dapat ditolak dari status menunggu persetujuan")
    }
    return await claimTransition(
      { workflowStatus: "pending_approval" },
      {
        workflowStatus: "rejected",
        rejectionReason: requireText(reason, "Alasan penolakan pengajuan peringatan wajib diisi"),
      },
      "Pengajuan hanya dapat ditolak dari status menunggu persetujuan",
      "reject",
      recordId,
      "Menolak pengajuan peringatan",
    )
  } catch (e) {
    return fail(e, "rejectDisciplinaryRecord")
  }
}

/* ------------------------------------------------------------------ */
/* Tanda terima & tanggapan                                            */
/* ------------------------------------------------------------------ */

export async function acknowledgeDisciplinaryRecord(
  recordId: number,
  method: string,
  refused: boolean,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("create_disciplinary_records")
    assertValidId(recordId, "Rekod disiplin")
    const record = await loadRecord(recordId)
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, record.employeeId)
    if (record.workflowStatus !== "issued") {
      throw new Error("Tanda terima hanya untuk surat peringatan yang sudah terbit")
    }
    const cleanMethod = requireText(method, "Cara penerimaan wajib diisi")
    return await claimTransition(
      { workflowStatus: "issued", acknowledgmentAt: null },
      {
        acknowledgmentAt: new Date(),
        acknowledgmentMethod: cleanMethod,
        acknowledgmentRefused: refused === true,
      },
      "Tanda terima sudah tercatat untuk rekod ini",
      "update",
      recordId,
      "Mencatat tanda terima surat peringatan",
    )
  } catch (e) {
    return fail(e, "acknowledgeDisciplinaryRecord")
  }
}

export async function respondDisciplinaryRecord(
  recordId: number,
  response: string,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("view_disciplinary_records")
    assertValidId(recordId, "Rekod disiplin")
    const record = await loadRecord(recordId)
    const me = await callerEmployeeId(user.id)
    if (me == null) throw new Error("Akun Anda tidak terhubung ke data karyawan")
    const guard = evaluateDisciplinaryEmployeeResponse({
      recordEmployeeId: record.employeeId,
      recordWorkflowStatus: record.workflowStatus as "draft" | "pending_approval" | "issued" | "rejected",
      responderEmployeeId: me,
      response,
    })
    if (!guard.allowed) throw new Error(guard.message)
    const window = evaluateDisciplinaryResponseWindow({
      issuedAt: record.issuedAt,
      at: new Date(),
    })
    if (!window.allowed) throw new Error(window.message)
    return await claimTransition(
      { workflowStatus: "issued", employeeId: me },
      {
        employeeResponse: requireText(response, "Tanggapan karyawan wajib diisi"),
        employeeResponseAt: new Date(),
        employeeResponseLate: false,
      },
      "Tanggapan hanya dapat diberikan pada surat peringatan yang sudah terbit",
      "update",
      recordId,
      "Karyawan memberi tanggapan surat peringatan",
    )
  } catch (e) {
    return fail(e, "respondDisciplinaryRecord")
  }
}

/** Q-DISC-3: tanggapan terlambat hanya lewat HR, berlabel terlambat. */
export async function recordLateDisciplinaryResponse(
  recordId: number,
  response: string,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("create_disciplinary_records")
    assertValidId(recordId, "Rekod disiplin")
    const clean = requireText(response, "Tanggapan karyawan wajib diisi")
    const record = await loadRecord(recordId)
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, record.employeeId)
    if (scope.kind === "self") {
      throw new Error("Tanggapan terlambat hanya dapat ditempelkan oleh HR")
    }
    if (record.workflowStatus !== "issued") {
      throw new Error("Tanggapan hanya dapat diberikan pada surat peringatan yang sudah terbit")
    }
    return await claimTransition(
      { workflowStatus: "issued" },
      { employeeResponse: clean, employeeResponseAt: new Date(), employeeResponseLate: true },
      "Tanggapan hanya dapat diberikan pada surat peringatan yang sudah terbit",
      "update",
      recordId,
      "HR menempelkan tanggapan terlambat (terlambat)",
    )
  } catch (e) {
    return fail(e, "recordLateDisciplinaryResponse")
  }
}

/* ------------------------------------------------------------------ */
/* Pembatalan rekod issued (BR-DISC-10)                                */
/* ------------------------------------------------------------------ */

export async function voidDisciplinaryRecord(
  recordId: number,
  reason: string,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("approve_disciplinary_records")
    assertValidId(recordId, "Rekod disiplin")
    const cleanReason = requireText(reason, "Alasan pembatalan rekod peringatan wajib diisi")
    const record = await loadRecord(recordId)
    const { me } = await assertApprover(user, record)
    if (record.workflowStatus !== "issued") {
      throw new Error("Hanya rekod peringatan yang sudah terbit yang dapat dibatalkan")
    }
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const claim = await tx.employeeDisciplinaryRecord.updateMany({
        where: { id: recordId, workflowStatus: "issued", voidedAt: null, deletedAt: null },
        data: { voidedAt: now, voidedBy: me, voidReason: cleanReason },
      })
      if (claim.count === 0) throw new Error("Rekod peringatan ini sudah dibatalkan")
      // Rekod pembatal tertaut: bukan SP baru (voidedAt terisi sehingga
      // dikeluarkan builder dari rantai jenjang, AC-DISC-10).
      await tx.employeeDisciplinaryRecord.create({
        data: {
          employeeId: record.employeeId,
          level: record.level,
          violationCategory: record.violationCategory,
          violationDate: record.violationDate,
          description: `Pembatalan rekod peringatan: ${cleanReason}`,
          workflowStatus: "issued",
          requestedBy: me,
          issuedAt: now,
          voidOfId: recordId,
          voidedAt: now,
          voidedBy: me,
          voidReason: cleanReason,
          createdBy: Number(user.id),
        },
      })
    })
    await logActivity("update", "EmployeeDisciplinaryRecord", recordId, "Membatalkan rekod peringatan lewat rekod pembatal tertaut")
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "voidDisciplinaryRecord")
  }
}
