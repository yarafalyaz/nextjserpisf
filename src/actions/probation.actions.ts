"use server"

/**
 * Aksi evaluasi masa percobaan & keputusan kontrak (F-2026-10-24-099-S,
 * putusan Lead t_a52e310b Q-PROB-1/2/3/4/6). Penjaga murni hidup di
 * src/lib/reports/probation.ts; berkas ini hanya orkestrasi server:
 * izin -> scope -> muat fakta -> penjaga -> klaim transisi atomik ->
 * ActivityLog -> revalidate. Tanpa nominal/kompensasi (BR-PROB-11);
 * berhenti tetap alur F-085-S (employmentEndedAt di master.actions).
 *
 * Matriks izin (spec §4 + Q-PROB-2):
 * - lihat: view_employees + HrScope
 * - buka/tutup probation, ajukan, terapkan: edit_employees
 * - submit review: edit_employees DAN tercatat sebagai reviewerEmployeeId
 * - putus probation + setujui/tolak kontrak: approve_contracts, scope
 *   `all` SAJA (department/self ditolak server), SoD penuh.
 */

import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/auth/permissions"
import { assertHrEmployeeAccess, getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope"
import { prisma } from "@/lib/db/prisma"
import { logActivity } from "@/lib/services/activity-log.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import {
  evaluateExtendProbation,
  evaluateOpenProbation,
  evaluatePkwtCumulative,
  evaluateSubmitProbationReview,
  isContractDecisionKind,
  isProbationFinalDecision,
  probationMilestoneSlots,
  deriveProbationStatus,
  PROBATION_DERIVED_STATUS_LABELS,
  type ProbationFinalDecision,
} from "@/lib/reports/probation"

const REVALIDATE = "/master/karyawan"

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

function requireText(value: string | null | undefined, message: string): string {
  const clean = (value ?? "").trim()
  if (!clean) throw new Error(message)
  return clean
}

/** Employee id user pemanggil (identitas SoD = Employee, bukan userId). */
async function callerEmployeeId(userId: string): Promise<number | null> {
  const me = await prisma.employee.findFirst({
    where: { userId: Number(userId) },
    select: { id: true },
  })
  return me?.id ?? null
}

async function loadEmployeeForProbation(employeeId: number) {
  return prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      name: true,
      employmentStatus: true,
      joinDate: true,
      probationEndDate: true,
      contractStartDate: true,
      contractEndDate: true,
      employmentEndedAt: true,
      deletedAt: true,
    },
  })
}

function assertEmployeeUsable(employee: { deletedAt: Date | null } | null): asserts employee is NonNullable<typeof employee> {
  if (!employee || employee.deletedAt != null) throw new Error("Karyawan tidak ditemukan")
}

/* ------------------------------------------------------------------ */
/* Masa percobaan                                                      */
/* ------------------------------------------------------------------ */

export async function openProbation(employeeId: number, probationEndDate: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("edit_employees")
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid")
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, employeeId)
    if (scope.kind === "self") throw new Error("Anda tidak dapat membuka masa percobaan untuk diri sendiri")
    const employee = await loadEmployeeForProbation(employeeId)
    assertEmployeeUsable(employee)
    if (employee.probationEndDate != null) throw new Error("Karyawan ini sudah dalam masa percobaan")
    const end = parseDateOnly(probationEndDate, "Tanggal akhir masa percobaan")
    const guard = evaluateOpenProbation({
      employmentStatus: employee.employmentStatus,
      joinDate: employee.joinDate,
      probationEndDate: end,
    })
    if (!guard.allowed) throw new Error(guard.message)

    await prisma.employee.update({ where: { id: employeeId }, data: { probationEndDate: end } })
    await logActivity("update", "Employee", employeeId, `Membuka masa percobaan untuk ${employee.name}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "openProbation")
  }
}

export async function closeProbation(employeeId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("edit_employees")
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid")
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, employeeId)
    if (scope.kind === "self") throw new Error("Anda tidak dapat menutup masa percobaan untuk diri sendiri")
    const employee = await loadEmployeeForProbation(employeeId)
    assertEmployeeUsable(employee)
    if (employee.probationEndDate == null) throw new Error("Karyawan ini tidak dalam masa percobaan")

    await prisma.employee.update({ where: { id: employeeId }, data: { probationEndDate: null } })
    await logActivity("update", "Employee", employeeId, `Menutup masa percobaan untuk ${employee.name}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "closeProbation")
  }
}

/* ------------------------------------------------------------------ */
/* Review percobaan                                                    */
/* ------------------------------------------------------------------ */

export interface ProbationReviewFormInput {
  employeeId: number
  milestone: string
  reviewerEmployeeId: number
  technicalScore: string | null
  disciplineScore: string | null
  attendanceScore: string | null
  notes: string | null
  recommendation: string | null
}

export async function saveProbationReviewDraft(input: ProbationReviewFormInput): Promise<ActionResult> {
  try {
    const user = await requirePermission("edit_employees")
    const { employeeId, milestone, reviewerEmployeeId } = input
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid")
    if (!Number.isSafeInteger(reviewerEmployeeId) || reviewerEmployeeId <= 0) throw new Error("Penilai tidak valid")
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, employeeId)
    const employee = await loadEmployeeForProbation(employeeId)
    assertEmployeeUsable(employee)
    if (employee.probationEndDate == null) throw new Error("Karyawan ini tidak dalam masa percobaan")
    const slot = probationMilestoneSlots(employee.joinDate, employee.probationEndDate).find(
      (s) => s.milestone === milestone,
    )
    if (!slot) throw new Error("Titik evaluasi tidak valid untuk masa percobaan ini")

    const existing = await prisma.probationReview.findFirst({
      where: { employeeId, milestone: slot.milestone },
      select: { id: true, status: true },
    })
    if (existing && existing.status !== "draft") {
      throw new Error("Evaluasi titik ini sudah dikirim dan tidak dapat diubah")
    }
    const data = {
      employeeId,
      milestone: slot.milestone,
      dueDate: slot.dueDate,
      reviewerEmployeeId,
      technicalScore: input.technicalScore,
      disciplineScore: input.disciplineScore,
      attendanceScore: input.attendanceScore,
      notes: input.notes,
      recommendation: input.recommendation,
      status: "draft",
    }
    if (existing) await prisma.probationReview.update({ where: { id: existing.id }, data })
    else await prisma.probationReview.create({ data })
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "saveProbationReviewDraft")
  }
}

export async function submitProbationReview(reviewId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("edit_employees")
    if (!Number.isSafeInteger(reviewId) || reviewId <= 0) throw new Error("Evaluasi tidak valid")
    const review = await prisma.probationReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        employeeId: true,
        milestone: true,
        dueDate: true,
        reviewerEmployeeId: true,
        technicalScore: true,
        disciplineScore: true,
        attendanceScore: true,
        notes: true,
        recommendation: true,
        status: true,
      },
    })
    if (!review) throw new Error("Evaluasi tidak ditemukan")
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, review.employeeId)
    const me = await callerEmployeeId(user.id)
    if (me == null || me !== review.reviewerEmployeeId) {
      throw new Error("Hanya penilai tercatat yang dapat mengirim evaluasi ini")
    }
    if (review.status !== "draft") throw new Error("Evaluasi ini sudah dikirim")
    const guard = evaluateSubmitProbationReview({
      dueDate: review.dueDate,
      today: new Date(),
      technicalScore: review.technicalScore,
      disciplineScore: review.disciplineScore,
      attendanceScore: review.attendanceScore,
      notes: review.notes,
      recommendation: review.recommendation,
    })
    if (!guard.allowed) throw new Error(guard.message)

    const claim = await prisma.probationReview.updateMany({
      where: { id: reviewId, status: "draft" },
      data: { status: "submitted" },
    })
    if (claim.count === 0) throw new Error("Evaluasi ini sudah dikirim")
    await logActivity("update", "ProbationReview", reviewId, `Mengirim evaluasi percobaan titik ${review.milestone}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "submitProbationReview")
  }
}

/**
 * Putus akhir percobaan (approve_contracts, scope all, SoD penuh).
 * BR-PROB-07: wajib review final submitted. "extended" menuntut tanggal
 * akhir baru <= joinDate+3 bulan (BR-PROB-04); "passed"/"failed" menutup
 * probationEndDate. Berhenti akibat failed tetap dicatat HR lewat F-085-S.
 */
export async function decideProbation(
  employeeId: number,
  decision: string,
  newProbationEndDate?: string | null,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("approve_contracts")
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid")
    if (!isProbationFinalDecision(decision)) throw new Error("Keputusan akhir masa percobaan tidak valid")
    const scope = await getHrScope(user)
    if (scope.kind !== "all") {
      throw new Error("Persetujuan kontrak hanya dapat dilakukan oleh pemegang akses HR menyeluruh")
    }
    const employee = await loadEmployeeForProbation(employeeId)
    assertEmployeeUsable(employee)
    if (employee.probationEndDate == null) throw new Error("Karyawan ini tidak dalam masa percobaan")

    const slots = probationMilestoneSlots(employee.joinDate, employee.probationEndDate)
    const finalSlot = slots.find((s) => s.isFinal)
    const finalReview = finalSlot
      ? await prisma.probationReview.findFirst({
          where: { employeeId, milestone: finalSlot.milestone },
          select: { id: true, status: true, reviewerEmployeeId: true },
        })
      : null
    if (!finalReview || (finalReview.status !== "submitted" && finalReview.status !== "decided")) {
      throw new Error("Keputusan akhir masa percobaan wajib merujuk evaluasi final yang sudah dikirim")
    }
    const me = await callerEmployeeId(user.id)
    if (me != null && me === finalReview.reviewerEmployeeId) {
      throw new Error("Penyetuju tidak boleh sama dengan penilai evaluasi final")
    }

    let endUpdate: Date | null | undefined
    if (decision === "extended") {
      if (!newProbationEndDate) throw new Error("Tanggal akhir percobaan baru wajib diisi untuk perpanjangan percobaan")
      const newEnd = parseDateOnly(newProbationEndDate, "Tanggal akhir percobaan baru")
      const guard = evaluateExtendProbation({ joinDate: employee.joinDate, newProbationEndDate: newEnd })
      if (!guard.allowed) throw new Error(guard.message)
      endUpdate = newEnd
    } else {
      endUpdate = null
    }

    await prisma.$transaction(async (tx) => {
      await tx.probationReview.update({
        where: { id: finalReview.id },
        data: { status: "decided", finalDecision: decision, decidedBy: Number(user.id), decidedAt: new Date() },
      })
      await tx.employee.update({ where: { id: employeeId }, data: { probationEndDate: endUpdate } })
    })
    await logActivity("update", "ProbationReview", finalReview.id, `Memutus akhir masa percobaan: ${decision}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "decideProbation")
  }
}

/* ------------------------------------------------------------------ */
/* Pengajuan keputusan kontrak                                         */
/* ------------------------------------------------------------------ */

export interface ContractDecisionFormInput {
  employeeId: number
  kind: string
  proposedContractEndDate: string | null
  reason: string
}

async function appliedPkwtSegments(employeeId: number) {
  const rows = await prisma.contractDecisionRequest.findMany({
    where: { employeeId, status: "applied", kind: "extend_pkwt" },
    select: { appliedFromStartDate: true, appliedEndDate: true },
  })
  return rows
    .filter((r) => r.appliedFromStartDate != null && r.appliedEndDate != null)
    .map((r) => ({ start: r.appliedFromStartDate as Date, end: r.appliedEndDate as Date }))
}

export async function createContractDecisionRequest(input: ContractDecisionFormInput): Promise<ActionResult> {
  try {
    const user = await requirePermission("edit_employees")
    const { employeeId, kind } = input
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid")
    if (!isContractDecisionKind(kind)) throw new Error("Jenis keputusan kontrak tidak valid")
    const reason = requireText(input.reason, "Alasan pengajuan keputusan kontrak wajib diisi")
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, employeeId)
    if (scope.kind === "self") throw new Error("Anda tidak dapat mengajukan keputusan kontrak untuk diri sendiri")
    const employee = await loadEmployeeForProbation(employeeId)
    assertEmployeeUsable(employee)
    if (employee.employmentEndedAt != null) throw new Error("Karyawan sudah berhenti bekerja")

    const me = await callerEmployeeId(user.id)
    if (me == null) throw new Error("Akun Anda tidak terhubung ke data karyawan")

    let proposedEnd: Date | null = null
    if (kind === "extend_pkwt") {
      if (employee.employmentStatus !== "PKWT") {
        throw new Error("Perpanjangan PKWT hanya untuk karyawan Kontrak (PKWT)")
      }
      if (!input.proposedContractEndDate) throw new Error("Tanggal akhir kontrak usulan wajib diisi")
      proposedEnd = parseDateOnly(input.proposedContractEndDate, "Tanggal akhir kontrak usulan")
      const guard = evaluatePkwtCumulative({
        kind,
        appliedSegments: await appliedPkwtSegments(employeeId),
        currentStart: employee.contractStartDate,
        currentEnd: employee.contractEndDate,
        proposedEnd,
      })
      if (!guard.allowed) throw new Error(guard.message)
    } else if (kind === "convert_pkwtt") {
      if (employee.employmentStatus !== "PKWT") {
        throw new Error("Konversi ke PKWTT hanya untuk karyawan Kontrak (PKWT)")
      }
    }

    // Maks 1 pengajuan submitted per karyawan (spec §9 edge) — draft bebas.
    await prisma.contractDecisionRequest.create({
      data: {
        employeeId,
        kind,
        proposedContractEndDate: proposedEnd,
        reason,
        requestedBy: me,
        status: "draft",
      },
    })
    await logActivity("create", "ContractDecisionRequest", employeeId, `Membuat pengajuan keputusan kontrak ${kind}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "createContractDecisionRequest")
  }
}

export async function submitContractDecisionRequest(requestId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("edit_employees")
    if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new Error("Pengajuan tidak valid")
    const request = await prisma.contractDecisionRequest.findUnique({
      where: { id: requestId },
      select: { id: true, employeeId: true, kind: true, proposedContractEndDate: true, reason: true, status: true },
    })
    if (!request) throw new Error("Pengajuan tidak ditemukan")
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, request.employeeId)
    if (request.status !== "draft") throw new Error("Pengajuan hanya dapat diajukan dari status draft")
    requireText(request.reason, "Alasan pengajuan keputusan kontrak wajib diisi")

    const employee = await loadEmployeeForProbation(request.employeeId)
    assertEmployeeUsable(employee)
    if (request.kind === "extend_pkwt") {
      const guard = evaluatePkwtCumulative({
        kind: "extend_pkwt",
        appliedSegments: await appliedPkwtSegments(request.employeeId),
        currentStart: employee.contractStartDate,
        currentEnd: employee.contractEndDate,
        proposedEnd: request.proposedContractEndDate,
      })
      if (!guard.allowed) throw new Error(guard.message)
    }

    await prisma.$transaction(async (tx) => {
      const active = await tx.contractDecisionRequest.count({
        where: { employeeId: request.employeeId, status: "submitted" },
      })
      if (active > 0) throw new Error("Sudah ada pengajuan keputusan kontrak yang menunggu persetujuan untuk karyawan ini")
      const claim = await tx.contractDecisionRequest.updateMany({
        where: { id: requestId, status: "draft" },
        data: { status: "submitted" },
      })
      if (claim.count === 0) throw new Error("Pengajuan hanya dapat diajukan dari status draft")
    })
    await logActivity("submit", "ContractDecisionRequest", requestId, "Mengajukan keputusan kontrak")
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "submitContractDecisionRequest")
  }
}

async function loadRequestForDecision(requestId: number) {
  return prisma.contractDecisionRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      employeeId: true,
      kind: true,
      proposedContractEndDate: true,
      requestedBy: true,
      status: true,
      finalReviewId: true,
      finalReview: { select: { reviewerEmployeeId: true } },
    },
  })
}

async function assertContractApprover(
  userId: string,
  roles: string[],
  request: NonNullable<Awaited<ReturnType<typeof loadRequestForDecision>>>,
) {
  const scope = await getHrScope({ id: userId, roles })
  if (scope.kind !== "all") {
    throw new Error("Persetujuan kontrak hanya dapat dilakukan oleh pemegang akses HR menyeluruh")
  }
  const me = await callerEmployeeId(userId)
  if (me == null) throw new Error("Akun Anda tidak terhubung ke data karyawan")
  if (me === request.requestedBy) {
    throw new Error("Penyetuju tidak boleh menyetujui pengajuan yang diajukan sendiri")
  }
  if (request.finalReview && me === request.finalReview.reviewerEmployeeId) {
    throw new Error("Penyetuju tidak boleh sama dengan penilai evaluasi final yang dirujuk pengajuan ini")
  }
  return me
}

export async function approveContractDecisionRequest(requestId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("approve_contracts")
    if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new Error("Pengajuan tidak valid")
    const request = await loadRequestForDecision(requestId)
    if (!request) throw new Error("Pengajuan tidak ditemukan")
    await assertContractApprover(user.id, user.roles, request)
    if (request.status !== "submitted") throw new Error("Pengajuan hanya dapat disetujui dari status diajukan")

    // BR-PROB-08 ditegakkan ulang SEBELUM persetujuan disimpan (Q-PROB-6).
    if (request.kind === "extend_pkwt") {
      const employee = await loadEmployeeForProbation(request.employeeId)
      assertEmployeeUsable(employee)
      const guard = evaluatePkwtCumulative({
        kind: "extend_pkwt",
        appliedSegments: await appliedPkwtSegments(request.employeeId),
        currentStart: employee.contractStartDate,
        currentEnd: employee.contractEndDate,
        proposedEnd: request.proposedContractEndDate,
      })
      if (!guard.allowed) throw new Error(guard.message)
    }

    const claim = await prisma.contractDecisionRequest.updateMany({
      where: { id: requestId, status: "submitted" },
      data: { status: "approved", decidedBy: Number(user.id), decidedAt: new Date(), rejectionReason: null },
    })
    if (claim.count === 0) throw new Error("Pengajuan hanya dapat disetujui dari status diajukan")
    await logActivity("approve", "ContractDecisionRequest", requestId, "Menyetujui pengajuan keputusan kontrak")
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "approveContractDecisionRequest")
  }
}

export async function rejectContractDecisionRequest(requestId: number, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("approve_contracts")
    if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new Error("Pengajuan tidak valid")
    const cleanReason = requireText(reason, "Alasan penolakan wajib diisi")
    const request = await loadRequestForDecision(requestId)
    if (!request) throw new Error("Pengajuan tidak ditemukan")
    await assertContractApprover(user.id, user.roles, request)
    if (request.status !== "submitted") throw new Error("Pengajuan hanya dapat ditolak dari status diajukan")

    const claim = await prisma.contractDecisionRequest.updateMany({
      where: { id: requestId, status: "submitted" },
      data: { status: "rejected", decidedBy: Number(user.id), decidedAt: new Date(), rejectionReason: cleanReason },
    })
    if (claim.count === 0) throw new Error("Pengajuan hanya dapat ditolak dari status diajukan")
    await logActivity("reject", "ContractDecisionRequest", requestId, "Menolak pengajuan keputusan kontrak")
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "rejectContractDecisionRequest")
  }
}

export async function cancelContractDecisionRequest(requestId: number, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("edit_employees")
    if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new Error("Pengajuan tidak valid")
    requireText(reason, "Alasan pembatalan wajib diisi")
    const request = await prisma.contractDecisionRequest.findUnique({
      where: { id: requestId },
      select: { id: true, employeeId: true, requestedBy: true, status: true },
    })
    if (!request) throw new Error("Pengajuan tidak ditemukan")
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, request.employeeId)
    const me = await callerEmployeeId(user.id)
    if (me == null || me !== request.requestedBy) {
      throw new Error("Hanya pengaju yang dapat membatalkan pengajuan ini")
    }
    if (request.status !== "draft" && request.status !== "submitted") {
      throw new Error("Pengajuan hanya dapat dibatalkan dari status draft atau diajukan")
    }
    const claim = await prisma.contractDecisionRequest.updateMany({
      where: { id: requestId, status: request.status },
      data: { status: "cancelled" },
    })
    if (claim.count === 0) throw new Error("Pengajuan hanya dapat dibatalkan dari status draft atau diajukan")
    await logActivity("update", "ContractDecisionRequest", requestId, "Membatalkan pengajuan keputusan kontrak")
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "cancelContractDecisionRequest")
  }
}

/**
 * Terapkan keputusan disetujui ke master (BR-PROB-10: terapan == disetujui
 * persis jenis + tanggal). Payload TIDAK membawa nilai sendiri — nilai
 * dibaca dari baris approved. Konversi PKWT->PKWTT TIDAK membuka
 * probation (Q-PROB-1). end_contract TIDAK menulis employmentEndedAt:
 * penutupan tetap langkah HR F-085-S terpisah.
 */
export async function applyContractDecisionRequest(requestId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("edit_employees")
    if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new Error("Pengajuan tidak valid")
    const request = await prisma.contractDecisionRequest.findUnique({
      where: { id: requestId },
      select: { id: true, employeeId: true, kind: true, proposedContractEndDate: true, status: true },
    })
    if (!request) throw new Error("Pengajuan tidak ditemukan")
    const scope = await getHrScope(user)
    await assertHrEmployeeAccess(scope, request.employeeId)
    if (scope.kind === "self") throw new Error("Anda tidak dapat menerapkan keputusan kontrak untuk diri sendiri")
    if (request.status !== "approved") throw new Error("Pengajuan hanya dapat diterapkan sesudah disetujui")

    const me = await callerEmployeeId(user.id)

    await prisma.$transaction(async (tx) => {
      const claim = await tx.contractDecisionRequest.updateMany({
        where: { id: requestId, status: "approved" },
        data: { status: "applied", appliedAt: new Date(), appliedBy: me },
      })
      if (claim.count === 0) throw new Error("Pengajuan hanya dapat diterapkan sesudah disetujui")

      const employee = await tx.employee.findUnique({
        where: { id: request.employeeId },
        select: { contractStartDate: true, probationEndDate: true },
      })
      if (!employee) throw new Error("Karyawan tidak ditemukan")

      if (request.kind === "extend_pkwt") {
        if (!request.proposedContractEndDate) throw new Error("Tanggal akhir kontrak yang disetujui tidak ditemukan")
        await tx.contractDecisionRequest.update({
          where: { id: requestId },
          data: {
            appliedFromStartDate: employee.contractStartDate,
            appliedEndDate: request.proposedContractEndDate,
          },
        })
        await tx.employee.update({
          where: { id: request.employeeId },
          data: { contractEndDate: request.proposedContractEndDate },
        })
      } else if (request.kind === "convert_pkwtt") {
        // Q-PROB-1: konversi TIDAK membuka probation (probationEndDate utuh).
        await tx.employee.update({
          where: { id: request.employeeId },
          data: { employmentStatus: "PKWTT", contractEndDate: null },
        })
      }
      // end_contract: tanpa timpa tanggal/status berhenti (F-085-S).
    })
    await logActivity("update", "ContractDecisionRequest", requestId, `Menerapkan keputusan kontrak ${request.kind}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e) {
    return fail(e, "applyContractDecisionRequest")
  }
}

/* ------------------------------------------------------------------ */
/* Bacaan (kontrak Frontend)                                           */
/* ------------------------------------------------------------------ */

export interface ProbationOverviewRow {
  employeeId: number
  name: string
  employmentStatus: string | null
  joinDate: Date
  probationEndDate: Date | null
  derivedStatus: string
  derivedStatusLabel: string
  milestones: {
    milestone: string
    dueDate: Date
    isFinal: boolean
    reviewStatus: string | null
    filled: boolean
  }[]
}

export async function getProbationOverview(): Promise<ProbationOverviewRow[]> {
  const user = await requirePermission("view_employees")
  const scope = await getHrScope(user)
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, probationEndDate: { not: null }, ...hrEmployeeScopeWhere(scope) },
    select: {
      id: true,
      name: true,
      employmentStatus: true,
      joinDate: true,
      probationEndDate: true,
      probationReviews: {
        select: { milestone: true, dueDate: true, status: true, finalDecision: true },
      },
    },
    orderBy: { id: "asc" },
  })
  const today = new Date()
  return employees.map((e) => {
    const finalRow = e.probationReviews.find(
      (r) => (r.milestone === "90" || r.milestone === "final") && r.status === "decided",
    )
    const finalSubmitted = e.probationReviews.some(
      (r) => (r.milestone === "90" || r.milestone === "final") && r.status !== "draft",
    )
    const derived = deriveProbationStatus(
      {
        employmentStatus: e.employmentStatus,
        joinDate: e.joinDate,
        probationEndDate: e.probationEndDate,
        finalDecision: (finalRow?.finalDecision as ProbationFinalDecision | null) ?? null,
        finalReviewSubmitted: finalSubmitted,
      },
      today,
    )
    const slots = e.probationEndDate ? probationMilestoneSlots(e.joinDate, e.probationEndDate) : []
    return {
      employeeId: e.id,
      name: e.name,
      employmentStatus: e.employmentStatus,
      joinDate: e.joinDate,
      probationEndDate: e.probationEndDate,
      derivedStatus: derived,
      derivedStatusLabel: PROBATION_DERIVED_STATUS_LABELS[derived],
      milestones: slots.map((slot) => {
        const review = e.probationReviews.find((r) => r.milestone === slot.milestone)
        return {
          milestone: slot.milestone,
          dueDate: slot.dueDate,
          isFinal: slot.isFinal,
          reviewStatus: review?.status ?? null,
          filled: review != null && review.status !== "draft",
        }
      }),
    }
  })
}

export async function getContractDecisionRequests(employeeId: number) {
  const user = await requirePermission("view_employees")
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid")
  const scope = await getHrScope(user)
  await assertHrEmployeeAccess(scope, employeeId)
  return prisma.contractDecisionRequest.findMany({
    where: { employeeId },
    select: {
      id: true,
      employeeId: true,
      kind: true,
      proposedContractEndDate: true,
      reason: true,
      requestedBy: true,
      status: true,
      decidedBy: true,
      decidedAt: true,
      rejectionReason: true,
      appliedAt: true,
      appliedBy: true,
      createdAt: true,
    },
    orderBy: { id: "desc" },
  })
}
