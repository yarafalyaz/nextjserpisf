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
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"

const REVALIDATE = "/keuangan/giro"
const STATUSES = new Set(["pending", "cleared", "cancelled"])

// Giro/cek yang sudah berakhir tidak boleh berubah status lagi. Tanpa guard
// ini, cleared bisa di-flip balik ke pending atau cancelled dan menampilkan
// ulang tombol Cair/Batal (transfer kas kemudian terikat pada status yang
// sudah settle).
const TERMINAL_STATUSES = new Set(["cleared", "cancelled"])
const ALLOWED_FROM: Record<string, ReadonlySet<string>> = {
  pending: new Set(["cleared", "cancelled"]),
  cleared: new Set(),
  cancelled: new Set(),
}

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
    // dateOnly mengembalikan string; konversi WIB-midnight di sini agar
    // assertPeriodOpen menerima Date, bukan string polos.
    const dueDate = wibDateToUtcMidnight(v.dueDate)

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
      select: { id: true, documentNo: true, dueDate: true, status: true },
    })
    if (!cheque) return { success: false, error: "Giro/cek tidak ditemukan." }

    if (cheque.status === status) {
      return {
        success: false,
        error: `Status giro/cek sudah '${status}', tidak ada perubahan.`,
      }
    }
    const allowed = ALLOWED_FROM[cheque.status]
    if (!allowed || !allowed.has(status)) {
      if (TERMINAL_STATUSES.has(cheque.status)) {
        return {
          success: false,
          error: `Giro/cek sudah berakhir dengan status '${cheque.status}' dan tidak dapat diubah lagi.`,
        }
      }
      return {
        success: false,
        error: `Transisi status giro/cek dari '${cheque.status}' ke '${status}' tidak diizinkan.`,
      }
    }

    await assertPeriodOpen(cheque.dueDate)

    // Klaim transisi secara kondisional: hanya baris yang statusnya masih
    // sama saat dibaca yang boleh berpindah. Mencegah dua klik bersamaan
    // (cair + batal) sama-sama sukses.
    const claimed = await prisma.cheque.updateMany({
      where: { id, deletedAt: null, status: cheque.status },
      data: { status },
    })
    if (claimed.count === 0) {
      return {
        success: false,
        error: "Giro/cek berubah status oleh pengguna lain — muat ulang halaman.",
      }
    }

    await logActivity("update", "Cheque", id, `Mengubah status ${cheque.documentNo} dari ${cheque.status} menjadi ${status}`)
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
