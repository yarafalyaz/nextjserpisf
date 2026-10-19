"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { parseMoneyAmount } from "@/lib/utils/parse-money"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"

const REVALIDATE = "/keuangan/giro"
const STATUSES = new Set(["pending", "cleared", "cancelled"])

export async function createCheque(formData: FormData) {
  try {
    const user = await requirePermission("create_cheques")

    const type = formData.get("type") === "cek" ? "cek" : "giro"
    const direction = formData.get("direction") === "out" ? "out" : "in"
    const number = (formData.get("number") as string)?.trim() || null
    const party = (formData.get("party") as string)?.trim() || null
    const notes = (formData.get("notes") as string)?.trim() || null
    const accountIdRaw = Number(formData.get("accountId"))
    const accountId = Number.isSafeInteger(accountIdRaw) && accountIdRaw > 0 ? accountIdRaw : null

    const amount = parseMoneyAmount(formData.get("amount"))
    if (amount === null || amount <= 0) {
      return { success: false, error: "Nominal giro/cek harus lebih dari 0." }
    }

    const dueRaw = String(formData.get("dueDate") ?? "")
    const dueDate = new Date(dueRaw)
    if (!dueRaw || Number.isNaN(dueDate.getTime())) {
      return { success: false, error: "Tanggal jatuh tempo tidak valid." }
    }

    await assertPeriodOpen(dueDate)

    if (accountId) {
      const exists = await prisma.account.count({ where: { id: accountId } })
      if (!exists) return { success: false, error: "Rekening bank yang dipilih tidak ditemukan." }
    }

    const documentNo = await generateDocumentNumber("CHQ", "simple")

    const cheque = await prisma.cheque.create({
      data: {
        documentNo,
        type,
        direction,
        number,
        accountId,
        party,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        dueDate,
        notes,
        status: "pending",
        createdBy: Number(user.id),
      },
    })

    await logActivity("create", "Cheque", cheque.id, `Mencatat ${type} ${documentNo}`)
    revalidatePath(REVALIDATE)
    return { success: true, id: cheque.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createCheque]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateChequeStatus(id: number, status: string) {
  try {
    await requirePermission("edit_cheques")
    if (!STATUSES.has(status)) {
      return { success: false, error: "Status giro/cek tidak dikenal." }
    }

    const cheque = await prisma.cheque.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, documentNo: true, dueDate: true },
    })
    if (!cheque) return { success: false, error: "Giro/cek tidak ditemukan." }

    await assertPeriodOpen(cheque.dueDate)

    await prisma.cheque.update({ where: { id }, data: { status } })

    await logActivity("update", "Cheque", id, `Mengubah status ${cheque.documentNo} menjadi ${status}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateChequeStatus]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteCheque(id: number) {
  try {
    await requirePermission("delete_cheques")

    const cheque = await prisma.cheque.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, documentNo: true, dueDate: true },
    })
    if (!cheque) return { success: false, error: "Giro/cek tidak ditemukan." }

    await assertPeriodOpen(cheque.dueDate)

    // Soft delete: register giro ikut audit trail, jadi barisnya tidak dihapus fisik.
    await prisma.cheque.update({ where: { id }, data: { deletedAt: new Date() } })

    await logActivity("delete", "Cheque", id, `Menghapus ${cheque.documentNo}`)
    revalidatePath(REVALIDATE)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteCheque]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
