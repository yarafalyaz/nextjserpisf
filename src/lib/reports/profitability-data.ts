/**
 * Pemuatan data untuk laporan **Profitabilitas & HPP**.
 *
 * HPP per faktur diambil dari pengeluaran stok yang diposting untuk faktur itu
 * (`StockMove` `referenceType: "SalesInvoice"`, `impact: "OUT"`, `status: "posted"`)
 * — sumber yang sama dengan pembalikan posting faktur, jadi angka laporan dan
 * angka buku tidak bisa berbeda. Untuk dimensi per barang, pengeluaran stok
 * dipetakan per (faktur, barang).
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
      items: { select: { itemId: true, description: true, total: true } },
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

  // HPP per (faktur, barang) dan penanda "baris ini punya pengeluaran stok".
  const cogsByInvoiceItem = new Map<string, number>()
  const movedInvoiceItems = new Set<string>()
  for (const move of moves) {
    if (move.itemId === null) continue
    const key = `${move.referenceId}-${move.itemId}`
    movedInvoiceItems.add(key)
    cogsByInvoiceItem.set(key, (cogsByInvoiceItem.get(key) ?? 0) + Number(move.qty) * Number(move.cost))
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
    const invoiceKey = `invoice-${invoice.id}`
    const customerKey = `customer-${invoice.customerId}`
    const customerName = invoice.customer.name
    // HPP per (faktur, barang) hanya boleh dihitung sekali per bucket:
    // satu SKU bisa muncul di 2+ baris faktur, lineCogs agregat per (invoice,item)
    // jadi penambahan per baris akan menggandakan HPP.
    const cogsApplied = new Set<string>()

    for (const line of invoice.items) {
      const revenue = Number(line.total)
      const item = line.itemId !== null ? itemById.get(line.itemId) : undefined
      const isService = line.itemId === null || item?.isService === true
      const cogsKey = line.itemId !== null ? `${invoice.id}-${line.itemId}` : null
      const lineCogs = cogsKey ? cogsByInvoiceItem.get(cogsKey) ?? 0 : 0
      const moved = cogsKey ? movedInvoiceItems.has(cogsKey) : false

      const targets: ProfitLineInput[] = [bucketFor(invoiceKey, `${invoice.documentNo} · ${customerName}`), bucketFor(customerKey, customerName)]

      if (dimension === "barang") {
        const itemKey = line.itemId !== null ? `item-${line.itemId}` : "item-none"
        const label =
          line.itemId !== null && item
            ? `${item.sku} — ${item.name}`
            : (line.description ?? "Tanpa barang")
        targets.push(bucketFor(itemKey, label))
      }

      for (const target of targets) {
        target.revenue += revenue
        if (revenue !== 0 && !moved) {
          target.revenueLinesWithoutCogs += 1
          if (isService) {
            target.serviceLinesWithoutCogs += 1
          } else {
            // Akumulasi per-baris stok tanpa HPP (jasa dikecualikan).
            target.stockRevenueWithoutCogs = (target.stockRevenueWithoutCogs ?? 0) + revenue
          }
        }
      }

      // HPP dialokasikan ke dimensi yang sesuai — tepat sekali per (bucket, cogsKey).
      // Baris jasa/tanpa-barang (cogsKey null) punya lineCogs 0 → lewati.
      if (cogsKey !== null) {
        if (dimension === "barang") {
          const itemKey = `item-${line.itemId}`
          const appliedKey = `${itemKey}|${cogsKey}`
          if (!cogsApplied.has(appliedKey)) {
            cogsApplied.add(appliedKey)
            buckets.get(itemKey)!.cogs += lineCogs
          }
        }
        const invoiceAppliedKey = `${invoiceKey}|${cogsKey}`
        if (!cogsApplied.has(invoiceAppliedKey)) {
          cogsApplied.add(invoiceAppliedKey)
          bucketFor(invoiceKey, `${invoice.documentNo} · ${customerName}`).cogs += lineCogs
        }
        const customerAppliedKey = `${customerKey}|${cogsKey}`
        if (!cogsApplied.has(customerAppliedKey)) {
          cogsApplied.add(customerAppliedKey)
          buckets.get(customerKey)!.cogs += lineCogs
        }
      }
    }
  }

  return {
    result: buildProfitability({ lines: [...buckets.values()], dimension }),
    ...rangePeriodLabels(period),
  }
}
