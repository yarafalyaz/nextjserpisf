/**
 * F-PRICELIST-01 tahap 1: resolusi harga price-list pelanggan.
 *
 * Keputusan mengikat (vonis akuntansi):
 * 1) Harga price-list hanya memotong HARGA JUAL dan diterapkan SEBELUM
 *    subtotal -> taxAmount (DPP PPN ikut turun). Diskon tidak pernah
 *    diterapkan sesudah pajak.
 * 2) Prioritas: harga price-list menjadi unitPrice baris; diskon baris
 *    manual menimpa di atasnya (manual menang); total diskon efektif
 *    dibatasi 100% dari nilai baris dan tercatat di kolom `discount`
 *    existing — TIDAK ada tabel/kolom diskon baru.
 * 3) Tahap 1 hanya daftar harga per kategori pelanggan dan/atau per item
 *    + tanggal efektif, diterapkan saat baris dibuat. Tanpa PricingRule
 *    umum, tanpa aturan qty/promo.
 * 4) Margin minimum = peringatan lunak. JANGAN blokir jurnal, JANGAN
 *    sesuaikan HPP; jual di bawah HPP tetap posting (FIFO tak tersentuh).
 *
 * File ini MURNI (tanpa Prisma): pemanggil menyuplai baris price-list yang
 * sudah dimuat, fungsi memilih harga efektif per item.
 */

import { safeMultiply, safeSubtract } from "@/lib/utils/math"

export interface PriceListRow {
  /** null = harga per item berlaku untuk semua kategori pelanggan. */
  customerCategoryId: number | null
  itemId: number
  price: number
  effectiveDate: Date | null
  isActive: boolean
}

export interface ResolvedLinePricing {
  /** Harga jual efektif: price-list menang atas Item.price. */
  unitPrice: number
  /** Diskon manual (rupiah per baris) setelah cap 100%. */
  discount: number
  /** Total baris = qty*unitPrice - discount, tidak pernah negatif. */
  total: number
  /** Harga yang dipakai berasal dari baris price-list. */
  fromPriceList: boolean
  /** Peringatan lunak: total baris di bawah qty x HPP. Tidak memblokir. */
  belowCost: boolean
}

const rowDate = (row: PriceListRow): number =>
  row.effectiveDate ? row.effectiveDate.getTime() : Number.NEGATIVE_INFINITY

/**
 * Pilih harga price-list untuk satu item pada tanggal dokumen.
 * Baris kategori pelanggan spesifik menang atas baris umum (kategori null);
 * di antara kandidat setara, tanggal efektif terbaru menang. Baris belum
 * efektif (effectiveDate > tanggal dokumen) atau nonaktif dilewati.
 * Mengembalikan null bila tidak ada baris yang berlaku (= pakai Item.price).
 */
export function pickPriceListPrice(
  rows: readonly PriceListRow[],
  input: { itemId: number; customerCategoryId: number | null; date: Date },
): number | null {
  const at = input.date.getTime()
  const candidates = rows.filter(
    (r) =>
      r.itemId === input.itemId &&
      r.isActive &&
      (r.effectiveDate === null || rowDate(r) <= at) &&
      (r.customerCategoryId === null || r.customerCategoryId === input.customerCategoryId),
  )
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const specA = a.customerCategoryId === null ? 0 : 1
    const specB = b.customerCategoryId === null ? 0 : 1
    if (specA !== specB) return specB - specA
    return rowDate(b) - rowDate(a)
  })
  return candidates[0].price
}

/**
 * Terapkan price-list + diskon manual ke satu baris dokumen penjualan.
 * Urutan: unitPrice <- price-list (atau Item.price bila tak ada baris);
 * diskon manual menimpa di atasnya dengan cap sebesar nilai baris (100%).
 * Karena total baris inilah yang masuk subtotal dokumen, pajak (PPN) selalu
 * dihitung dari nilai SETELAH diskon — diskon sebelum pajak.
 */
export function resolveLinePricing(input: {
  qty: number
  /** Item.price fallback bila price-list tidak punya baris berlaku. */
  itemPrice: number
  /** HPP per unit untuk peringatan margin lunak (0 = tak diketahui). */
  itemCost?: number
  /** Hasil pickPriceListPrice; null = tidak ada price-list berlaku. */
  priceListPrice: number | null
  /** Diskon manual kiriman form (rupiah per baris). */
  manualDiscount?: number
}): ResolvedLinePricing {
  const qty = Math.max(0, Number(input.qty) || 0)
  const unitPrice = Math.max(0, Number(input.priceListPrice ?? input.itemPrice) || 0)
  const gross = safeMultiply(qty, unitPrice, 0)
  const discount = Math.min(Math.max(0, Number(input.manualDiscount) || 0), gross)
  const total = Math.max(0, safeSubtract(gross, discount, 0))
  const cost = Math.max(0, Number(input.itemCost) || 0)
  return {
    unitPrice,
    discount,
    total,
    fromPriceList: input.priceListPrice !== null && input.priceListPrice !== undefined,
    belowCost: cost > 0 && qty > 0 && total < safeMultiply(qty, cost, 0),
  }
}

/**
 * Loader: muat baris price-list berlaku untuk pasangan (pelanggan, item).
 * Kategori pelanggan dibaca dari Customer; tanpa kategori hanya baris umum
 * yang berlaku. Satu query per dokumen (bukan per baris).
 */
export async function loadPriceListRows(
  client: {
    customer: {
      findUnique: (args: {
        where: { id: number }
        select: { customerCategoryId: true }
      }) => Promise<{ customerCategoryId: number | null } | null>
    }
    customerPriceList: {
      findMany: (args: {
        where: {
          itemId: { in: number[] }
          isActive: true
          OR: ({ customerCategoryId: null } | { customerCategoryId: number })[]
        }
        select: {
          customerCategoryId: true
          itemId: true
          price: true
          effectiveDate: true
          isActive: true
        }
      }) => Promise<
        {
          customerCategoryId: number | null
          itemId: number
          price: unknown
          effectiveDate: Date | null
          isActive: boolean
        }[]
      >
    }
  },
  input: { customerId: number; itemIds: number[]; date: Date },
): Promise<{ customerCategoryId: number | null; rows: PriceListRow[] }> {
  const ids = [...new Set(input.itemIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (ids.length === 0) return { customerCategoryId: null, rows: [] }

  const customer = await client.customer.findUnique({
    where: { id: input.customerId },
    select: { customerCategoryId: true },
  })
  const customerCategoryId = customer?.customerCategoryId ?? null

  const rows = await client.customerPriceList.findMany({
    where: {
      itemId: { in: ids },
      isActive: true,
      OR: [{ customerCategoryId: null }, ...(customerCategoryId ? [{ customerCategoryId }] : [])],
    },
    select: { customerCategoryId: true, itemId: true, price: true, effectiveDate: true, isActive: true },
  })
  return {
    customerCategoryId,
    rows: rows.map((r) => ({ ...r, price: Number(r.price) })),
  }
}

/** Terapkan resolver ke seluruh baris dokumen sekaligus. */
export function priceDocumentLines<T extends { itemId: number | null; qty: number; discount?: number }>(
  lines: readonly T[],
  ctx: {
    rows: readonly PriceListRow[]
    customerCategoryId: number | null
    date: Date
    itemById: ReadonlyMap<number, { price: number; cost: number }>
  },
): (T & ResolvedLinePricing)[] {
  return lines.map((line) => {
    const item = line.itemId ? ctx.itemById.get(line.itemId) : undefined
    const priceListPrice =
      line.itemId && item
        ? pickPriceListPrice(ctx.rows, { itemId: line.itemId, customerCategoryId: ctx.customerCategoryId, date: ctx.date })
        : null
    const resolved = resolveLinePricing({
      qty: line.qty,
      itemPrice: item?.price ?? 0,
      itemCost: item?.cost,
      priceListPrice,
      manualDiscount: line.discount,
    })
    return { ...line, ...resolved }
  })
}
