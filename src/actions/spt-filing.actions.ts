"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { parseFormData } from "@/lib/validations/parse-form"
import { sptFilingSchema } from "@/lib/validations/spt-filing.schemas"

/**
 * Server action Register Pelaporan SPT (R4 — SOP Pembetulan SPT PER-12/PJ/2026).
 *
 * APPEND-ONLY & NON-GL:
 * - Tidak membuat jurnal akuntansi dan tidak tunduk pada period lock.
 * - Versi sebelumnya (Normal = 0, Pembetulan-1 = 1, dst.) tidak boleh ditimpa.
 */

const REVALIDATE = "/keuangan/register-spt"

export interface SptFilingActionResult {
  success: boolean
  error?: string
  id?: number
}

export async function createSptFiling(
  formData: FormData,
): Promise<SptFilingActionResult> {
  try {
    const user = await requirePermission("create_spt_filings")
    const parsed = parseFormData(sptFilingSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const filedAt = wibDateToUtcMidnight(v.filedAt)
    const idempotencyKey = formData.get("idempotencyKey") as string | null

    const created = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id)

      const existing = await tx.sptFiling.findUnique({
        where: {
          sptType_period_amendmentNo: {
            sptType: v.sptType,
            period: v.period,
            amendmentNo: v.amendmentNo,
          },
        },
        select: { id: true },
      })
      if (existing) {
        const versionLabel =
          v.amendmentNo === 0 ? "Normal" : `Pembetulan ke-${v.amendmentNo}`
        throw new Error(
          `Versi ${versionLabel} untuk ${v.sptType.toUpperCase()} masa ${v.period} sudah tercatat. Register bersifat append-only; tambah nomor pembetulan berikutnya.`,
        )
      }

      if (v.taxPaymentId != null) {
        const payment = await tx.taxPayment.findFirst({
          where: { id: v.taxPaymentId, deletedAt: null, NOT: { status: "void" } },
          select: { id: true },
        })
        if (!payment) {
          throw new Error(
            "Setoran pajak tertaut tidak ditemukan atau sudah dibatalkan.",
          )
        }
      }

      return tx.sptFiling.create({
        data: {
          sptType: v.sptType,
          period: v.period,
          amendmentNo: v.amendmentNo,
          filedAt,
          bpeNumber: v.bpeNumber,
          underOverPayment: v.underOverPayment,
          compensationBalance: v.compensationBalance,
          taxPaymentId: v.taxPaymentId ?? null,
          varianceNote: v.varianceNote ?? null,
          createdBy: Number.isFinite(Number(user.id)) ? Number(user.id) : null,
        },
      })
    })

    const versionLabel =
      v.amendmentNo === 0 ? "Normal" : `Pembetulan-${v.amendmentNo}`
    await logActivity(
      "create",
      "SptFiling",
      created.id,
      `Mencatat lapor ${v.sptType.toUpperCase()} masa ${v.period} (${versionLabel}) BPE ${v.bpeNumber}`,
    )

    revalidatePath(REVALIDATE)
    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}
