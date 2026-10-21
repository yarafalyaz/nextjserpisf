"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { parseFormData } from "@/lib/validations/parse-form"
import { customerPriceListSchema } from "@/lib/validations/price-list.schemas"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"

const REVALIDATE = "/penjualan/harga-pelanggan"

export interface CustomerPriceListActionResult {
  success: boolean
  error?: string
  id?: number
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

/**
 * F-PRICELIST-01 tahap 1 + F-2026-10-21-018: simpan satu baris daftar harga jual.
 *
 * Kombinasi (kategori, barang, minQty, tanggal efektif) unik. MySQL
 * memperlakukan NULL sebagai berbeda di unique index, jadi duplikat baris
 * umum (kategori null) dicegah cek aplikasi ini, bukan constraint DB.
 */
export async function createCustomerPriceList(formData: FormData): Promise<CustomerPriceListActionResult> {
  try {
    const user = await requirePermission("create_customer_price_lists")

    const parsed = parseFormData(customerPriceListSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const categoryId = v.customerCategoryId ?? null
    const effectiveDate = v.effectiveDate ? wibDateToUtcMidnight(v.effectiveDate) : null
    const minQty = new Prisma.Decimal(v.minQty.toFixed(2))

    const duplicate = await prisma.customerPriceList.findFirst({
      where: { customerCategoryId: categoryId, itemId: v.itemId, minQty, effectiveDate },
      select: { id: true },
    })
    if (duplicate) {
      return {
        success: false,
        error: "Harga untuk kategori, barang, minimal qty, dan tanggal efektif itu sudah ada. Ubah baris yang ada.",
      }
    }

    const created = await prisma.customerPriceList.create({
      data: {
        customerCategoryId: categoryId,
        itemId: v.itemId,
        price: toMoney(v.price),
        minQty,
        effectiveDate,
        notes: v.notes ?? null,
        createdBy: Number(user.id),
      },
    })

    await logActivity("create", "CustomerPriceList", created.id, "Menambah daftar harga pelanggan")
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("createCustomerPriceList failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menyimpan daftar harga.") }
  }
}

export async function updateCustomerPriceList(id: number, formData: FormData): Promise<CustomerPriceListActionResult> {
  try {
    await requirePermission("edit_customer_price_lists")

    const existing = await prisma.customerPriceList.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return { success: false, error: "Daftar harga tidak ditemukan." }

    const parsed = parseFormData(customerPriceListSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const categoryId = v.customerCategoryId ?? null
    const effectiveDate = v.effectiveDate ? wibDateToUtcMidnight(v.effectiveDate) : null
    const minQty = new Prisma.Decimal(v.minQty.toFixed(2))

    const duplicate = await prisma.customerPriceList.findFirst({
      where: { customerCategoryId: categoryId, itemId: v.itemId, minQty, effectiveDate, id: { not: id } },
      select: { id: true },
    })
    if (duplicate) {
      return { success: false, error: "Sudah ada baris lain dengan kategori, barang, minimal qty, dan tanggal efektif yang sama." }
    }

    await prisma.customerPriceList.update({
      where: { id },
      data: {
        customerCategoryId: categoryId,
        itemId: v.itemId,
        price: toMoney(v.price),
        minQty,
        effectiveDate,
        notes: v.notes ?? null,
      },
    })

    await logActivity("update", "CustomerPriceList", id, "Mengubah daftar harga pelanggan")
    revalidatePath(REVALIDATE)
    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("updateCustomerPriceList failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal mengubah daftar harga.") }
  }
}

export async function deleteCustomerPriceList(id: number): Promise<CustomerPriceListActionResult> {
  try {
    await requirePermission("delete_customer_price_lists")

    const existing = await prisma.customerPriceList.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return { success: false, error: "Daftar harga tidak ditemukan." }

    await prisma.customerPriceList.delete({ where: { id } })
    await logActivity("delete", "CustomerPriceList", id, "Menghapus daftar harga pelanggan")
    revalidatePath(REVALIDATE)
    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("deleteCustomerPriceList failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menghapus daftar harga.") }
  }
}
