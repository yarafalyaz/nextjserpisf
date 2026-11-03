"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { parseFormData } from "@/lib/validations/parse-form"
import { customerPriceListSchema } from "@/lib/validations/price-list.schemas"
import { getWibTodayUtcDate, wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { checkIdempotency } from "@/lib/utils/idempotency"

const REVALIDATE = "/penjualan/harga-pelanggan"

export interface CustomerPriceListActionResult {
  success: boolean
  error?: string
  id?: number
}

function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}

type PriceListForm = ReturnType<typeof customerPriceListSchema.parse>

function priceListData(v: PriceListForm) {
  return {
    customerCategoryId: v.customerCategoryId ?? null,
    itemId: v.itemId,
    price: toMoney(v.price),
    minQty: toMoney(v.minQty),
    effectiveDate: v.effectiveDate ? wibDateToUtcMidnight(v.effectiveDate) : null,
    // F-2026-10-25-001-S BR-PX-01: tanggal berakhir opsional, konvensi date-only sama.
    expiresAt: v.expiresAt ? wibDateToUtcMidnight(v.expiresAt) : null,
    notes: v.notes ?? null,
  }
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
    const data = priceListData(parsed.data)

    // BR-PX-06: tanggal berakhir lampau saat BUAT ditolak (baris lahir mati).
    if (data.expiresAt && data.expiresAt < getWibTodayUtcDate()) {
      return {
        success: false,
        error: "Tanggal berakhir sudah lewat. Isi tanggal berakhir di masa depan atau kosongkan untuk tanpa batas.",
      }
    }

    // Serialisasi per item: unique DB tak menahan tuple ber-NULL (kategori /
    // tanggal efektif kosong), jadi cek duplikat WAJIB di dalam tx sesudah
    // kunci baris items — dua create konkuren untuk item sama terserialkan
    // dan cek kedua melihat baris pertama (bukan snapshot lepas).
    // Putaran 87: idempotency key — retry jaringan dengan key sama ditolak
    // server sebelum cek duplikat, sehingga retry dengan satu digit berubah
    // tidak melahirkan baris kedua yang terpilih senyap oleh resolver.
    const idempotencyKey = formData.get("idempotencyKey") as string | null
    const outcome = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id)
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${data.itemId} FOR UPDATE`
      // Putaran 68: kunci saja tak membuktikan hidup — nilai ulang dari
      // bacaan terkunci (FOR UPDATE adalah locking read, melihat commit
      // terbaru walau snapshot tx sudah terbentuk). Barang yang
      // dinonaktifkan/dihapus sesudah halaman dirender tak boleh ditanami
      // harga yang kelak otomatis dipakai faktur saat diaktifkan lagi.
      const item = await tx.item.findFirst({
        where: { id: data.itemId, deletedAt: null, isActive: true },
        select: { id: true },
      })
      if (!item) return { deadItem: true as const }
      if (data.customerCategoryId != null) {
        const category = await tx.customerCategory.findFirst({
          where: { id: data.customerCategoryId, deletedAt: null, isActive: true },
          select: { id: true },
        })
        if (!category) return { deadCategory: true as const }
      }
      const duplicate = await tx.customerPriceList.findFirst({
        where: { customerCategoryId: data.customerCategoryId, itemId: data.itemId, minQty: data.minQty, effectiveDate: data.effectiveDate },
        select: { id: true },
      })
      if (duplicate) return { duplicate: true as const }
      const created = await tx.customerPriceList.create({
        data: { ...data, createdBy: Number(user.id) },
      })
      return { created }
    })
    if ("deadItem" in outcome) {
      return { success: false, error: "Barang tidak ditemukan atau tidak aktif." }
    }
    if ("deadCategory" in outcome) {
      return { success: false, error: "Kategori pelanggan tidak ditemukan atau tidak aktif." }
    }
    if ("duplicate" in outcome) {
      return {
        success: false,
        error: "Harga untuk kategori, barang, minimal qty, dan tanggal efektif itu sudah ada. Ubah baris yang ada.",
      }
    }
    const created = outcome.created

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
    const data = priceListData(parsed.data)

    // Serialisasi per item sama seperti create: cek duplikat + update dalam
    // satu tx sesudah kunci baris items, dinilai dari bacaan terkunci.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${data.itemId} FOR UPDATE`
      // Putaran 68: gerbang hidup sama seperti create — dinilai dari bacaan
      // terkunci sesudah kunci baris items.
      const item = await tx.item.findFirst({
        where: { id: data.itemId, deletedAt: null, isActive: true },
        select: { id: true },
      })
      if (!item) return { deadItem: true as const }
      if (data.customerCategoryId != null) {
        const category = await tx.customerCategory.findFirst({
          where: { id: data.customerCategoryId, deletedAt: null, isActive: true },
          select: { id: true },
        })
        if (!category) return { deadCategory: true as const }
      }
      const duplicate = await tx.customerPriceList.findFirst({
        where: { customerCategoryId: data.customerCategoryId, itemId: data.itemId, minQty: data.minQty, effectiveDate: data.effectiveDate, id: { not: id } },
        select: { id: true },
      })
      if (duplicate) return { duplicate: true as const }
      await tx.customerPriceList.update({ where: { id }, data })
      return { updated: true as const }
    })
    if ("deadItem" in outcome) {
      return { success: false, error: "Barang tidak ditemukan atau tidak aktif." }
    }
    if ("deadCategory" in outcome) {
      return { success: false, error: "Kategori pelanggan tidak ditemukan atau tidak aktif." }
    }
    if ("duplicate" in outcome) {
      return { success: false, error: "Sudah ada baris lain dengan kategori, barang, minimal qty, dan tanggal efektif yang sama." }
    }

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
