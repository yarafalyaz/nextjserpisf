"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"

const REVALIDATE = "/pembelian/harga-pemasok"

export interface VendorPriceActionResult {
  success: boolean
  error?: string
  id?: number
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

function parseNumber(raw: FormDataEntryValue | null, fallback: number | null = null): number | null {
  const text = String(raw ?? "").trim()
  if (text === "") return fallback
  const value = Number(text.replace(",", "."))
  return Number.isFinite(value) ? value : null
}

function parseId(raw: FormDataEntryValue | null): number | null {
  const value = Number(String(raw ?? ""))
  return Number.isInteger(value) && value > 0 ? value : null
}

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const text = String(raw ?? "").trim()
  if (!text) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
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

    const vendorId = parseId(formData.get("vendorId"))
    const itemId = parseId(formData.get("itemId"))
    if (!vendorId) return { success: false, error: "Pemasok wajib dipilih." }
    if (!itemId) return { success: false, error: "Barang wajib dipilih." }

    const price = parseNumber(formData.get("price"))
    if (price === null || price <= 0) return { success: false, error: "Harga harus lebih dari 0." }

    const minQty = parseNumber(formData.get("minQty"), 1) ?? 1
    if (minQty <= 0) return { success: false, error: "Minimal qty harus lebih dari 0." }

    const notes = String(formData.get("notes") ?? "").trim() || null
    const effectiveDate = parseDate(formData.get("effectiveDate"))
    if (String(formData.get("effectiveDate") ?? "").trim() && !effectiveDate) {
      return { success: false, error: "Tanggal berlaku tidak valid." }
    }

    const duplicate = await prisma.vendorItemPrice.findFirst({
      where: { vendorId, itemId, minQty: toMoney(minQty) },
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
        vendorId,
        itemId,
        price: toMoney(price),
        minQty: toMoney(minQty),
        effectiveDate,
        notes,
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

    const vendorId = parseId(formData.get("vendorId"))
    const itemId = parseId(formData.get("itemId"))
    if (!vendorId) return { success: false, error: "Pemasok wajib dipilih." }
    if (!itemId) return { success: false, error: "Barang wajib dipilih." }

    const price = parseNumber(formData.get("price"))
    if (price === null || price <= 0) return { success: false, error: "Harga harus lebih dari 0." }

    const minQty = parseNumber(formData.get("minQty"), 1) ?? 1
    if (minQty <= 0) return { success: false, error: "Minimal qty harus lebih dari 0." }

    const notes = String(formData.get("notes") ?? "").trim() || null
    const effectiveDate = parseDate(formData.get("effectiveDate"))

    const duplicate = await prisma.vendorItemPrice.findFirst({
      where: { vendorId, itemId, minQty: toMoney(minQty), id: { not: id } },
      select: { id: true },
    })
    if (duplicate) {
      return { success: false, error: "Sudah ada baris lain dengan pemasok, barang, dan minimal qty yang sama." }
    }

    await prisma.vendorItemPrice.update({
      where: { id },
      data: { vendorId, itemId, price: toMoney(price), minQty: toMoney(minQty), effectiveDate, notes },
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
