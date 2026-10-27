"use server"

/**
 * Klaim reimbursement karyawan mandiri (F-2026-10-25-017-S, vonis
 * F-2026-10-25-018-V) — di atas Expense existing, BUKAN model kedua.
 *
 * Kontrak untuk Frontend (konsumen):
 * - createReimbursementClaim(formData): ajukan klaim. Server menetapkan
 *   pengaju dari getHrScope (payload employeeId hanya untuk mode titip
 *   scope `all`); akun beban ditetapkan keuangan, BUKAN pilihan pengaju.
 *   Return: { success, id?, documentNo?, duplicateCandidates? } —
 *   duplicateCandidates = peringatan BR-RB-10 (bukan blokir): UI wajib
 *   menampilkan kandidat itu; pengajuan tetap tersimpan.
 * - setReimbursementClaimAccounts(expenseId, formData): keuangan tetapkan
 *   accountId (beban) + paidFromAccountId (sumber bayar) klaim draft.
 * - getMyReimbursementClaims(): daftar klaim dalam scope pemanggil
 *   (self/department/all via hrScopeWhere). Baris memuat tahap turunan
 *   verbatim builder (stage/stageLabel) — UI dilarang hitung tahap sendiri.
 *
 * Approve/bayar tetap approveExpense/markExpensePaid di finance.actions
 * (gerbang bukti BR-RB-04 + SoD BR-RB-07 + jurnal J-RB1/J-RB2 khusus klaim
 * di sana). Q-RB-1 default tahap ini = key khusus
 * create_employee_reimbursements (fail-closed, seed parity) — menunggu
 * ratifikasi Lead; Q-RB-2 = rantai ApprovalWorkflow Expense existing.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"
import "@/lib/validations/zod-locale";

import { getHrScope, hrScopeWhere, assertHrEmployeeAccess } from "@/lib/auth/hr-scope"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import {
  deriveReimbursementStage,
  findReimbursementDuplicateCandidates,
  REIMBURSEMENT_STAGE_LABELS,
  type ReimbursementDuplicateCandidateLike,
} from "@/lib/reports/reimbursement"
import { REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE, REIMBURSEMENT_PAYMENT_REFERENCE_TYPE } from "@/lib/hooks/accounting.hook"
import { logActivity } from "@/lib/services/activity-log.service"
import { requestApprovalIfConfigured } from "@/lib/services/approval-workflow.service"
import { attachPendingTransactionAttachments } from "@/lib/services/transaction-attachment.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { nextSlug } from "@/lib/utils/slug-db"
import { parseFormData } from "@/lib/validations/parse-form"

const REVALIDATE = "/keuangan/pengeluaran"

const claimSchema = z.object({
  // Hanya dibaca pada mode titip (scope all). Mode mandiri: diabaikan,
  // pengaju selalu karyawan tertaut user (BR-RB-02, AC-RB-B1).
  employeeId: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().positive("Nominal klaim harus lebih dari 0"),
  date: z.string().min(1, "Tanggal pengeluaran wajib diisi"),
  referenceNo: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  receiptImage: z.string().max(500).optional(),
  acknowledgeDuplicates: z.coerce.boolean().optional(),
})

const accountsSchema = z.object({
  accountId: z.coerce.number().int().positive("Akun beban wajib dipilih"),
  paidFromAccountId: z.coerce.number().int().positive().optional(),
})

function fail(e: unknown, context: string) {
  if (isNextRedirectError(e)) throw e
  console.error(`[${context}]`, e)
  return { success: false as const, error: getErrorMessage(e) }
}

function dateKeyWib(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function createReimbursementClaim(formData: FormData) {
  try {
    const user = await requirePermission("create_employee_reimbursements")
    const parsed = parseFormData(claimSchema, formData)
    if (!parsed.success)
      return { success: false as const, error: `Validasi gagal: ${parsed.error}` }
    const v = parsed.data

    const scope = await getHrScope(user)
    let claimantEmployeeId: number
    if (scope.kind === "all" && v.employeeId != null) {
      // Mode titip (BR-RB-02): pengaju = karyawan pemilik biaya,
      // pembuat tercatat createdBy = user keuangan.
      await assertHrEmployeeAccess(scope, v.employeeId)
      claimantEmployeeId = v.employeeId
    } else {
      // Mode mandiri: pengaju ditetapkan server; employeeId payload
      // karyawan lain ditimpa, tidak pernah dipercaya (AC-RB-B1).
      if (scope.kind === "self" && scope.employeeId <= 0) {
        throw new Error(
          "Akun Anda belum tertaut ke data karyawan — klaim mandiri tidak dapat diajukan. Hubungi HR untuk menautkan akun.",
        )
      }
      if (scope.kind === "all") {
        const me = await prisma.employee.findFirst({
          where: { userId: Number(user.id) },
          select: { id: true },
        })
        if (!me) {
          throw new Error(
            "Akun Anda belum tertaut ke data karyawan — klaim mandiri tidak dapat diajukan.",
          )
        }
        claimantEmployeeId = me.id
      } else {
        claimantEmployeeId = scope.employeeId
      }
    }

    const claimant = await prisma.employee.findUnique({
      where: { id: claimantEmployeeId },
      select: { id: true, employmentEndedAt: true },
    })
    if (!claimant) throw new Error("Data karyawan pengaju tidak ditemukan.")
    if (claimant.employmentEndedAt) {
      throw new Error("Karyawan pengaju sudah nonaktif — klaim baru ditolak (EC-1).")
    }

    // Akun beban klaim: placeholder akun beban pertama aktif; keuangan
    // WAJIB menetapkan ulang lewat setReimbursementClaimAccounts sebelum
    // approve (J-RB1 memakai accountId final). ponytail: tanpa master
    // kategori->akun existing, tebakan akun di jalur pengaju dilarang
    // (BR-RB-06) — jadi klaim lahir dengan penanda butuh penetapan akun,
    // bukan akun karangan.
    const placeholderAccount = await prisma.account.findFirst({
      where: { type: "EXPENSE" },
      orderBy: { id: "asc" },
      select: { id: true },
    })
    if (!placeholderAccount) {
      throw new Error("Belum ada akun beban di COA — klaim tidak dapat dibuat.")
    }

    const expenseDate = wibDateToUtcMidnight(v.date)
    const candidatesRaw = await prisma.expense.findMany({
      where: {
        isReimbursementClaim: true,
        employeeId: claimantEmployeeId,
        referenceNo: v.referenceNo ?? undefined,
        status: { notIn: ["paid", "rejected"] },
      },
      select: {
        id: true, documentNo: true, employeeId: true, date: true,
        amount: true, referenceNo: true, status: true,
      },
    })
    const duplicateCandidates: ReimbursementDuplicateCandidateLike[] =
      findReimbursementDuplicateCandidates(
        {
          employeeId: claimantEmployeeId,
          dateKey: dateKeyWib(expenseDate),
          amount: v.amount,
          referenceNo: v.referenceNo ?? null,
        },
        candidatesRaw.map((c) => ({
          id: c.id,
          documentNo: c.documentNo,
          employeeId: c.employeeId,
          dateKey: dateKeyWib(c.date),
          amount: Number(c.amount),
          referenceNo: c.referenceNo,
          status: c.status,
        })),
      )
    if (duplicateCandidates.length > 0 && !v.acknowledgeDuplicates) {
      return {
        success: false as const,
        error:
          "Ditemukan klaim serupa yang belum selesai (pengaju + tanggal + nominal + nomor nota sama). Periksa kandidat — ajukan ulang dengan acknowledgeDuplicates=1 bila memang pengeluaran berbeda (BR-RB-10).",
        duplicateCandidates: duplicateCandidates.map((c) => ({
          id: c.id,
          documentNo: c.documentNo,
          status: c.status,
        })),
      }
    }

    const documentNo = await generateDocumentNumber("EXP")
    const idempotencyKey = formData.get("idempotencyKey") as string | null
    const attachmentIds = formData.get("attachmentIds") as string | null

    const claim = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id)
      const created = await tx.expense.create({
        data: {
          documentNo,
          slug: await nextSlug("expense", documentNo),
          isReimbursementClaim: true,
          employeeId: claimantEmployeeId,
          accountId: placeholderAccount.id,
          paidFromAccountId: null,
          projectId: v.projectId ?? null,
          amount: v.amount,
          date: expenseDate,
          referenceNo: v.referenceNo ?? null,
          description:
            (v.description ?? "") +
            (duplicateCandidates.length > 0
              ? ` [KLAIM-DOBEL-DIAKUI: ${duplicateCandidates.map((c) => c.documentNo).join(",")}]`
              : "") || null,
          categoryId: v.categoryId ?? null,
          receiptImage: v.receiptImage ?? null,
          status: "draft",
          createdBy: Number(user.id),
        },
      })
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds,
          referenceType: "expense",
          referenceId: created.id,
          uploadedBy: Number(user.id),
        })
      }
      return created
    })

    await logActivity("create", "Expense", claim.id, "Mengajukan klaim reimbursement")
    await requestApprovalIfConfigured("Expense", claim.id, Number(user.id))
    revalidatePath(REVALIDATE)
    return {
      success: true as const,
      id: claim.id,
      documentNo: claim.documentNo,
      duplicateCandidates: duplicateCandidates.map((c) => ({
        id: c.id,
        documentNo: c.documentNo,
        status: c.status,
      })),
    }
  } catch (e: unknown) {
    return fail(e, "createReimbursementClaim")
  }
}

export async function setReimbursementClaimAccounts(
  expenseId: number,
  formData: FormData,
) {
  try {
    await requirePermission("approve_expenses")
    const parsed = parseFormData(accountsSchema, formData)
    if (!parsed.success)
      return { success: false as const, error: `Validasi gagal: ${parsed.error}` }
    const v = parsed.data

    const claim = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
    })
    if (!claim.isReimbursementClaim) {
      throw new Error("Penetapan akun ini hanya untuk klaim reimbursement.")
    }
    if (claim.status !== "draft") {
      throw new Error("Akun klaim hanya dapat ditetapkan saat klaim masih draft.")
    }
    for (const aid of [v.accountId, v.paidFromAccountId]) {
      if (aid != null) {
        const ok = await prisma.account.count({ where: { id: aid } })
        if (!ok)
          throw new Error(`Akun tidak ditemukan (id: ${aid}). Pilih ulang akun.`)
      }
    }

    const updated = await prisma.expense.updateMany({
      where: { id: expenseId, isReimbursementClaim: true, status: "draft" },
      data: {
        accountId: v.accountId,
        paidFromAccountId: v.paidFromAccountId ?? null,
      },
    })
    if (updated.count === 0) {
      throw new Error("Klaim sudah diproses atau status tidak valid")
    }

    await logActivity(
      "update",
      "Expense",
      expenseId,
      "Menetapkan akun klaim reimbursement",
    )
    revalidatePath(REVALIDATE)
    return { success: true as const }
  } catch (e: unknown) {
    return fail(e, "setReimbursementClaimAccounts")
  }
}

export async function getMyReimbursementClaims() {
  try {
    const user = await requirePermission("create_employee_reimbursements")
    const scope = await getHrScope(user)
    const where = {
      isReimbursementClaim: true,
      ...hrScopeWhere(scope),
    }
    const claims = await prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        documentNo: true,
        employeeId: true,
        amount: true,
        date: true,
        referenceNo: true,
        description: true,
        status: true,
        createdAt: true,
        category: { select: { label: true } },
        employee: { select: { name: true } },
      },
    })
    const ids = claims.map((c) => c.id)
    const journals = ids.length
      ? await prisma.journal.findMany({
          where: {
            referenceId: { in: ids },
            referenceType: {
              in: [
                REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
                REIMBURSEMENT_PAYMENT_REFERENCE_TYPE,
              ],
            },
            // Hanya jurnal AKTIF = fakta tahap; J-RB reversed/terhapus tidak menghitung (Putusan 2).
            status: { not: "REVERSED" },
            deletedAt: null,
          },
          select: { referenceId: true, referenceType: true },
        })
      : []
    const paidIds = new Set(
      journals
        .filter((j) => j.referenceType === REIMBURSEMENT_PAYMENT_REFERENCE_TYPE)
        .map((j) => j.referenceId),
    )
    const accruedIds = new Set(
      journals
        .filter((j) => j.referenceType === REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE)
        .map((j) => j.referenceId),
    )

    return {
      success: true as const,
      data: claims.map((c) => {
        const stage = deriveReimbursementStage({
          status: c.status,
          hasPaymentJournal: paidIds.has(c.id),
        })
        return {
          id: c.id,
          documentNo: c.documentNo,
          employeeId: c.employeeId,
          employeeName: c.employee?.name ?? null,
          amount: Number(c.amount),
          date: c.date,
          referenceNo: c.referenceNo,
          description: c.description,
          status: c.status,
          categoryLabel: c.category?.label ?? null,
          stage,
          stageLabel: REIMBURSEMENT_STAGE_LABELS[stage],
          hasAccrualJournal: accruedIds.has(c.id),
          hasPaymentJournal: paidIds.has(c.id),
          createdAt: c.createdAt,
        }
      }),
    }
  } catch (e: unknown) {
    return fail(e, "getMyReimbursementClaims")
  }
}
