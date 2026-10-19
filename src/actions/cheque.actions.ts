"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { parseFormData } from "@/lib/validations/parse-form"
import { chequeSchema } from "@/lib/validations/finance.schemas"

const REVALIDATE = "/keuangan/giro"
const STATUSES = new Set(["pending", "cleared", "cancelled"])

export async function createCheque(formData: FormData) {
  try {
    const user = await requirePermission("create_cheques")

    const parsed = parseFormData(chequeSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const type = v.type
    const direction = v.direction
    const number = v.number ?? null
    const party = v.party ?? null
    const notes = v.notes ?? null
    const accountId = v.accountId ?? null
    const amount = v.amount
    const dueDate = v.dueDate

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
      select: { id: true, documentNo: true },
    })
    if (!cheque) return { success: false, error: "Giro/cek tidak ditemukan." }

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
      select: { id: true, documentNo: true },
    })
    if (!cheque) return { success: false, error: "Giro/cek tidak ditemukan." }

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
