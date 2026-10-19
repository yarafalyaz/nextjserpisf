/**
 * Pemuatan data untuk laporan **Profitabilitas & HPP**.
 *
 * HPP per faktur diambil dari pengeluaran stok yang diposting untuk faktur itu
 * (`StockMove` `referenceType: "SalesInvoice"`, `impact: "OUT"`, `status: "posted"`)
 * — sumber yang sama dengan pembalikan posting faktur, jadi angka laporan dan
 * angka buku tidak bisa berbeda. Untuk dimensi per barang, pengeluaran stok
 * dipetakan per (faktur, barang).
 *
 * Cakupan HPP berbasis **kuantitas** (R-13), bukan sekadar "ada move atau tidak":
 *
 * - Qty faktur diagregat per (faktur, barang) dari `SalesInvoiceItem.qty`
 *   (satu SKU bisa muncul di 2+ baris — dijumlah, bukan dihitung per baris).
 * - Qty keluar diagregat per (faktur, barang) dari `move.qty` pada move OUT
 *   posted yang sama yang dipakai untuk HPP.
 * - Baris dianggap ber-HPP penuh hanya bila `movedQty >= invoicedQty - epsilon`.
 *   Epsilon eksplisit `QTY_EPSILON = 1e-9`: qty disimpan `Decimal(15,2)`, jadi
 *   selisih nyata terkecil 0,01; epsilon ini hanya menelan galat representasi
 *   `Number(Decimal)` (jauh di bawah 0,01) tanpa pernah menganggap keluar
 *   sebagian sebagai penuh.
 * - Bila kurang (parsial / nihil), pendapatan yang belum ter-cover masuk
 *   `stockRevenueWithoutCogs` **proporsional**:
 *   `uncoveredRevenue = revenue × uncoveredQty / invoicedQty`, dihitung di level
 *   agregat (faktur, barang) lalu diatribusikan ke tiap baris SKU itu sebesar
 *   bagiannya (`lineRevenue × uncoveredFraction`), jadi total konsisten di
 *   dimensi barang, faktur, dan pelanggan — tidak dobel, tidak hilang.
 * - `revenueLinesWithoutCogs` menghitung **garis (faktur, barang)** yang
 *   `uncoveredQty > epsilon`, sekali per garis — bukan per baris mentah — supaya
 *   SKU berulang dalam satu faktur tidak menggandakan hitungan garis. Baris jasa
 *   tetap dihitung per baris mentah di `serviceLinesWithoutCogs` (tanpa agregat
 *   qty, karena jasa memang tidak punya pengeluaran stok).
 * - Bucket hanya untuk dimensi terpilih (`faktur`/`barang`/`pelanggan`), satu
 *   bucket per baris: memasukkan bucket ketiga dimensi sekaligus ke
 *   `buildProfitability` akan menjumlah pendapatan/HPP yang sama 2–3 kali di
 *   total. Dengan satu dimensi per pemuatan, total ketiga dimensi konsisten.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildProfitability,
  type ProfitabilityDimension,
  type ProfitLineInput,
  type ProfitabilityResult,
} from "@/lib/reports/profitability"
import { rangePeriodLabels } from "@/lib/reports/period-label"

const RECOGNISED_INVOICE_STATUSES = ["posted", "partial", "paid"] as const

/**
 * Toleransi perbandingan qty (lihat header). Qty `Decimal(15,2)`; 1e-9 hanya
 * menyerap galat float dari `Number(Decimal)`, tidak pernah menutupi kekurangan
 * nyata (≥ 0,01).
 */
export const QTY_EPSILON = 1e-9

export interface ProfitabilityReport {
  result: ProfitabilityResult
  periodLabel: string
  periodCaption: string
}

export async function loadProfitability(
  period: { start: Date; end: Date },
  dimension: ProfitabilityDimension,
): Promise<ProfitabilityReport> {
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      date: { gte: period.start, lte: period.end },
      status: { in: [...RECOGNISED_INVOICE_STATUSES] },
      deletedAt: null,
    },
    select: {
      id: true,
      documentNo: true,
      customerId: true,
      customer: { select: { name: true } },
      items: { select: { itemId: true, description: true, qty: true, total: true } },
    },
    orderBy: { date: "asc" },
  })

  const invoiceIds = invoices.map((invoice) => invoice.id)
  const moves = invoiceIds.length
    ? await prisma.stockMove.findMany({
        where: {
          referenceType: "SalesInvoice",
          referenceId: { in: invoiceIds },
          impact: "OUT",
          status: "posted",
        },
        select: { referenceId: true, itemId: true, qty: true, cost: true },
      })
    : []

  const itemIds = [
    ...new Set([
      ...invoices.flatMap((invoice) => invoice.items.map((item) => item.itemId)),
      ...moves.map((move) => move.itemId),
    ].filter((id): id is number => id !== null)),
  ]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true, isService: true },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))

  // Agregat per (faktur, barang): HPP, qty keluar (posted OUT), qty faktur.
  const keyOf = (invoiceId: number, itemId: number) => `${invoiceId}-${itemId}`
  const cogsByInvoiceItem = new Map<string, number>()
  const movedQtyByInvoiceItem = new Map<string, number>()
  for (const move of moves) {
    if (move.itemId === null || move.referenceId === null) continue
    const key = keyOf(move.referenceId, move.itemId)
    const qty = Number(move.qty)
    movedQtyByInvoiceItem.set(key, (movedQtyByInvoiceItem.get(key) ?? 0) + qty)
    cogsByInvoiceItem.set(key, (cogsByInvoiceItem.get(key) ?? 0) + qty * Number(move.cost))
  }

  const invoicedQtyByInvoiceItem = new Map<string, number>()
  for (const invoice of invoices) {
    for (const line of invoice.items) {
      if (line.itemId === null) continue
      const key = keyOf(invoice.id, line.itemId)
      invoicedQtyByInvoiceItem.set(key, (invoicedQtyByInvoiceItem.get(key) ?? 0) + Number(line.qty))
    }
  }

  /**
   * Fraksi pendapatan belum ter-cover HPP untuk garis (faktur, barang):
   * `clamp((invoicedQty - movedQty) / invoicedQty, 0, 1)`, dan 0 bila selisih
   * masih dalam epsilon (dianggap penuh — termasuk kelebihan keluar, mis.
   * move melebihi qty faktur, yang tidak boleh menghasilkan fraksi negatif).
   * Garis tanpa qty faktur (qty 0) tidak punya dasar proporsi → 0.
   */
  const uncoveredFractionByInvoiceItem = new Map<string, number>()
  for (const [key, invoicedQty] of invoicedQtyByInvoiceItem) {
    if (!(invoicedQty > 0)) {
      uncoveredFractionByInvoiceItem.set(key, 0)
      continue
    }
    const uncoveredQty = invoicedQty - (movedQtyByInvoiceItem.get(key) ?? 0)
    uncoveredFractionByInvoiceItem.set(
      key,
      uncoveredQty <= QTY_EPSILON ? 0 : Math.min(uncoveredQty / invoicedQty, 1),
    )
  }

  const buckets = new Map<string, ProfitLineInput>()

  const bucketFor = (key: string, label: string): ProfitLineInput => {
    const existing = buckets.get(key)
    if (existing) return existing
    const created: ProfitLineInput = {
      key,
      label,
      revenue: 0,
      cogs: 0,
      revenueLinesWithoutCogs: 0,
      serviceLinesWithoutCogs: 0,
      stockRevenueWithoutCogs: 0,
    }
    buckets.set(key, created)
    return created
  }

  for (const invoice of invoices) {
    const invoiceLabel = `${invoice.documentNo} · ${invoice.customer.name}`
    // HPP per (faktur, barang) hanya boleh dihitung sekali per bucket:
    // satu SKU bisa muncul di 2+ baris faktur, lineCogs agregat per (invoice,item)
    // jadi penambahan per baris akan menggandakan HPP.
    const cogsApplied = new Set<string>()
    // Garis (faktur, barang) tanpa HPP penuh juga dihitung sekali per bucket:
    // SKU berulang tetap satu garis, walau pendapatannya diatribusikan per baris.
    const uncoveredCounted = new Set<string>()

    // Tepat satu bucket per baris, menurut dimensi terpilih.
    const bucketForLine = (line: (typeof invoice.items)[number]): ProfitLineInput => {
      if (dimension === "pelanggan") return bucketFor(`customer-${invoice.customerId}`, invoice.customer.name)
      if (dimension === "barang") {
        if (line.itemId === null) return bucketFor("item-none", line.description ?? "Tanpa barang")
        const item = itemById.get(line.itemId)
        return bucketFor(`item-${line.itemId}`, item ? `${item.sku} — ${item.name}` : (line.description ?? "Tanpa barang"))
      }
      return bucketFor(`invoice-${invoice.id}`, invoiceLabel)
    }

    for (const line of invoice.items) {
      const revenue = Number(line.total)
      const item = line.itemId !== null ? itemById.get(line.itemId) : undefined
      const isService = line.itemId === null || item?.isService === true
      const cogsKey = line.itemId !== null ? keyOf(invoice.id, line.itemId) : null
      const lineCogs = cogsKey ? cogsByInvoiceItem.get(cogsKey) ?? 0 : 0
      // Pendapatan baris ini yang belum ter-cover HPP. Jasa: seluruhnya "tanpa
      // HPP" secara definisi (dihitung terpisah, bukan stok). Stok: proporsi
      // qty belum keluar pada garis (faktur, barang)-nya.
      const uncoveredFraction = !isService && cogsKey ? uncoveredFractionByInvoiceItem.get(cogsKey) ?? 0 : 0
      const uncoveredRevenue = revenue * uncoveredFraction

      const target = bucketForLine(line)
      target.revenue += revenue
      if (revenue !== 0) {
        if (isService) {
          target.revenueLinesWithoutCogs += 1
          target.serviceLinesWithoutCogs += 1
        } else if (uncoveredFraction > 0) {
          // Atribusi proporsional per baris: Σ baris SKU = fraksi × Σ revenue
          // garis, jadi konsisten antar dimensi tanpa dobel.
          target.stockRevenueWithoutCogs = (target.stockRevenueWithoutCogs ?? 0) + uncoveredRevenue
          const countedKey = `${target.key}|${cogsKey}`
          if (!uncoveredCounted.has(countedKey)) {
            uncoveredCounted.add(countedKey)
            target.revenueLinesWithoutCogs += 1
          }
        }
      }

      // HPP: tepat sekali per (bucket, garis faktur-barang); baris berikutnya
      // dengan SKU sama dalam faktur yang sama tidak menambah lagi.
      if (cogsKey !== null && !cogsApplied.has(cogsKey)) {
        cogsApplied.add(cogsKey)
        target.cogs += lineCogs
      }
    }
  }

  return {
    result: buildProfitability({ lines: [...buckets.values()], dimension }),
    ...rangePeriodLabels(period),
  }
}
