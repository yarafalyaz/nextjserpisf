"use server"

/**
 * F-2026-10-25-035-B (Q-CL2-2/Q-CL2-3): aksi override gerbang kredit.
 *
 * Approve/reject: requirePermission approve_credit_overrides + SoD mutlak
 * server (penyetuju != requestedBy dari id terautentikasi, tanpa pengecualian
 * admin) + alasan tolak wajib. Baca daftar/jejak: approve_credit_overrides
 * ATAU view_reports, fail-closed selain itu (requireAnyPermission redirect).
 * Status kedaluwarsa diturunkan saat baca (deriveCreditOverrideStatus).
 */

import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import {
  creditOverrideExpiryWib,
  deriveCreditOverrideStatus,
} from "@/lib/services/credit-gate.service"
import { logActivity } from "@/lib/services/activity-log.service"
import { revalidatePath } from "next/cache"

function serializeOverride(row: {
  id: number
  customerId: number
  documentType: string
  attemptedAmount: unknown
  creditLimit: unknown
  exposure: unknown
  exposureStatus: string
  utilization: unknown
  quotationId: number | null
  salesOrderId: number | null
  requestedBy: number
  requestReason: string
  status: string
  decidedBy: number | null
  decidedAt: Date | null
  decisionReason: string | null
  usedDocumentId: number | null
  usedDocumentNo: string | null
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
  customer?: { name: string } | null
}) {
  const status = deriveCreditOverrideStatus(row, new Date())
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    documentType: row.documentType,
    attemptedAmount: Number(row.attemptedAmount),
    creditLimit: Number(row.creditLimit),
    exposure: Number(row.exposure),
    exposureStatus: row.exposureStatus,
    utilization: row.utilization == null ? null : Number(row.utilization),
    quotationId: row.quotationId,
    salesOrderId: row.salesOrderId,
    requestedBy: row.requestedBy,
    requestReason: row.requestReason,
    status,
    storedStatus: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionReason: row.decisionReason,
    usedDocumentId: row.usedDocumentId,
    usedDocumentNo: row.usedDocumentNo,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listCreditOverrides(opts?: { status?: string }) {
  try {
    await requireAnyPermission(["approve_credit_overrides", "view_reports"])
    const rows = await prisma.creditOverride.findMany({
      where: opts?.status ? { status: opts.status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { customer: { select: { name: true } } },
    })
    return { success: true as const, data: rows.map(serializeOverride) }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[listCreditOverrides]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function getMyCreditOverrideStatus(overrideId: number) {
  try {
    const user = await requireAnyPermission([
      "approve_credit_overrides",
      "view_reports",
      "create_sales_orders",
      "create_sales_invoices",
    ])
    const row = await prisma.creditOverride.findUnique({
      where: { id: overrideId },
      include: { customer: { select: { name: true } } },
    })
    if (!row) return { success: false as const, error: "Permintaan override tidak ditemukan" }
    const isApprover = (user.permissions ?? []).includes("approve_credit_overrides")
    const canReport = (user.permissions ?? []).includes("view_reports")
    if (!isApprover && !canReport && row.requestedBy !== Number(user.id)) {
      return { success: false as const, error: "Permintaan override tidak ditemukan" }
    }
    return { success: true as const, data: serializeOverride(row) }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[getMyCreditOverrideStatus]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function approveCreditOverride(overrideId: number) {
  try {
    const user = await requirePermission("approve_credit_overrides")
    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.creditOverride.findUnique({ where: { id: overrideId } })
      if (!row) throw new Error("Permintaan override tidak ditemukan")
      if (deriveCreditOverrideStatus(row, now) !== "pending") {
        throw new Error("Permintaan override sudah tidak pending")
      }
      // SoD mutlak: penyetuju != peminta, tanpa pengecualian peran.
      if (row.requestedBy === Number(user.id)) {
        throw new Error("Penyetuju tidak boleh sama dengan peminta override (pemisahan tugas)")
      }
      const customer = await tx.customer.findUnique({
        where: { id: row.customerId },
        select: { deletedAt: true },
      })
      if (!customer || customer.deletedAt != null) {
        throw new Error("Pelanggan sudah diarsipkan; override gugur")
      }
      return tx.creditOverride.update({
        where: { id: overrideId },
        data: {
          status: "approved",
          decidedBy: Number(user.id),
          decidedAt: now,
          decisionReason: null,
          expiresAt: creditOverrideExpiryWib(now),
        },
      })
    })
    await logActivity("approve", "CreditOverride", result.id, `Menyetujui override batas kredit #${result.id}`)
    revalidatePath("/penjualan/pesanan")
    revalidatePath("/penjualan/faktur")
    return { success: true as const, id: result.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[approveCreditOverride]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function rejectCreditOverride(overrideId: number, reason: string) {
  try {
    const user = await requirePermission("approve_credit_overrides")
    const trimmed = reason?.trim()
    if (!trimmed) {
      return { success: false as const, error: "Alasan penolakan wajib diisi" }
    }
    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.creditOverride.findUnique({ where: { id: overrideId } })
      if (!row) throw new Error("Permintaan override tidak ditemukan")
      if (deriveCreditOverrideStatus(row, now) !== "pending") {
        throw new Error("Permintaan override sudah tidak pending")
      }
      if (row.requestedBy === Number(user.id)) {
        throw new Error("Penolak tidak boleh sama dengan peminta override (pemisahan tugas)")
      }
      return tx.creditOverride.update({
        where: { id: overrideId },
        data: {
          status: "rejected",
          decidedBy: Number(user.id),
          decidedAt: now,
          decisionReason: trimmed,
        },
      })
    })
    await logActivity("reject", "CreditOverride", result.id, `Menolak override batas kredit #${result.id}`)
    revalidatePath("/penjualan/pesanan")
    revalidatePath("/penjualan/faktur")
    return { success: true as const, id: result.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[rejectCreditOverride]", getErrorMessage(e) || e)
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
