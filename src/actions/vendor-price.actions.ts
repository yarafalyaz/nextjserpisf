"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { parseFormData } from "@/lib/validations/parse-form"
import { vendorPriceSchema } from "@/lib/validations/purchase.schemas"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"

const REVALIDATE = "/pembelian/harga-pemasok"

export interface VendorPriceActionResult {
  success: boolean
  error?: string
  id?: number
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

/**
 * Menyimpan satu baris harga pemasok.
 *
 * Kombinasi (pemasok, barang, min. qty) unik — duplikat ditolak dengan pesan yang
 * menyebut penyebabnya, bukan error basis data mentah.
 */
export async function createVendorPrice(formData: FormData): Promise<VendorPriceActionResult> {
  try {
    const user = await requirePermission("create_vendor_prices")

    const parsed = parseFormData(vendorPriceSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const duplicate = await prisma.vendorItemPrice.findFirst({
      where: { vendorId: v.vendorId, itemId: v.itemId, minQty: toMoney(v.minQty) },
      select: { id: true },
    })
    if (duplicate) {
      return {
        success: false,
        error: "Harga untuk pemasok, barang, dan minimal qty itu sudah ada. Ubah baris yang ada.",
      }
    }

    const created = await prisma.vendorItemPrice.create({
      data: {
        vendorId: v.vendorId,
        itemId: v.itemId,
        price: toMoney(v.price),
        minQty: toMoney(v.minQty),
        effectiveDate: v.effectiveDate ? wibDateToUtcMidnight(v.effectiveDate) : null,
        notes: v.notes ?? null,
        createdBy: Number(user.id),
      },
    })

    await logActivity("create", "VendorItemPrice", created.id, "Menambah harga pemasok")
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("createVendorPrice failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menyimpan harga pemasok.") }
  }
}

export async function updateVendorPrice(id: number, formData: FormData): Promise<VendorPriceActionResult> {
  try {
    await requirePermission("edit_vendor_prices")

    const existing = await prisma.vendorItemPrice.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return { success: false, error: "Harga pemasok tidak ditemukan." }

    const parsed = parseFormData(vendorPriceSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const duplicate = await prisma.vendorItemPrice.findFirst({
      where: { vendorId: v.vendorId, itemId: v.itemId, minQty: toMoney(v.minQty), id: { not: id } },
      select: { id: true },
    })
    if (duplicate) {
      return { success: false, error: "Sudah ada baris lain dengan pemasok, barang, dan minimal qty yang sama." }
    }

    await prisma.vendorItemPrice.update({
      where: { id },
      data: {
        vendorId: v.vendorId,
        itemId: v.itemId,
        price: toMoney(v.price),
        minQty: toMoney(v.minQty),
        effectiveDate: v.effectiveDate ? wibDateToUtcMidnight(v.effectiveDate) : null,
        notes: v.notes ?? null,
      },
    })

    await logActivity("update", "VendorItemPrice", id, "Mengubah harga pemasok")
    revalidatePath(REVALIDATE)
    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("updateVendorPrice failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal mengubah harga pemasok.") }
  }
}

export async function deleteVendorPrice(id: number): Promise<VendorPriceActionResult> {
  try {
    await requirePermission("delete_vendor_prices")

    const existing = await prisma.vendorItemPrice.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return { success: false, error: "Harga pemasok tidak ditemukan." }

    await prisma.vendorItemPrice.delete({ where: { id } })
    await logActivity("delete", "VendorItemPrice", id, "Menghapus harga pemasok")
    revalidatePath(REVALIDATE)
    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    console.error("deleteVendorPrice failed:", error)
    return { success: false, error: getErrorMessage(error, "Gagal menghapus harga pemasok.") }
  }
}
