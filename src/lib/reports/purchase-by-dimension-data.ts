/**
 * Pemuatan data untuk laporan **Pembelian per Pemasok / Barang / Biaya**.
 *
 * Sumber: tagihan vendor (`VendorBill`) yang sudah diposting, dibedah per barisnya
 * sehingga satu tagihan bisa tersebar ke beberapa kelompok (barang/biaya).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildPurchasesByDimension,
  type PurchaseByDimensionResult,
  type PurchaseDimension,
  type PurchaseLineInput,
} from "@/lib/reports/purchase-by-dimension"
import { rangePeriodLabels } from "@/lib/reports/period-label"

const RECOGNISED_BILL_STATUSES = ["posted", "partial", "paid"] as const

export interface PurchaseByDimensionReport {
  result: PurchaseByDimensionResult
  periodLabel: string
  periodCaption: string
}

export async function loadPurchasesByDimension(
  period: { start: Date; end: Date },
  dimension: PurchaseDimension,
): Promise<PurchaseByDimensionReport> {
  const bills = await prisma.vendorBill.findMany({
    where: {
      date: { gte: period.start, lte: period.end },
      status: { in: [...RECOGNISED_BILL_STATUSES] },
      deletedAt: null,
    },
    select: {
      id: true,
      documentNo: true,
      vendorId: true,
      vendor: { select: { name: true } },
      items: {
        select: { itemId: true, description: true, subtotal: true, discountAmount: true, taxAmount: true, accountId: true },
      },
    },
    orderBy: { date: "asc" },
  })

  const itemIds = [
    ...new Set(
      bills.flatMap((bill) => bill.items.map((item) => item.itemId)).filter((id): id is number => id !== null),
    ),
  ]
  const accountIds = [
    ...new Set(
      bills
        .flatMap((bill) => bill.items.map((item) => item.accountId))
        .filter((id): id is number => id !== null),
    ),
  ]

  const [items, accounts] = await Promise.all([
    itemIds.length
      ? prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, sku: true, name: true } })
      : Promise.resolve([] as { id: number; sku: string; name: string }[]),
    accountIds.length
      ? prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, code: true, name: true } })
      : Promise.resolve([] as { id: number; code: string; name: string }[]),
  ])

  const itemById = new Map(items.map((item) => [item.id, item]))
  const accountById = new Map(accounts.map((account) => [account.id, account]))

  const buckets = new Map<string, PurchaseLineInput>()
  const bucketFor = (key: string, label: string): PurchaseLineInput => {
    const existing = buckets.get(key)
    if (existing) return existing
    const created: PurchaseLineInput = { key, label, documentNos: [], dpp: 0, tax: 0 }
    buckets.set(key, created)
    return created
  }

  for (const bill of bills) {
    for (const line of bill.items) {
      const dpp = Number(line.subtotal) - Number(line.discountAmount)
      const tax = Number(line.taxAmount)

      let key: string
      let label: string
      if (dimension === "pemasok") {
        key = `vendor-${bill.vendorId}`
        label = bill.vendor.name
      } else if (dimension === "barang") {
        const item = line.itemId !== null ? itemById.get(line.itemId) : undefined
        key = line.itemId !== null ? `item-${line.itemId}` : "item-none"
        label = item ? `${item.sku} — ${item.name}` : (line.description ?? "Tanpa barang")
      } else {
        const account = line.accountId !== null ? accountById.get(line.accountId) : undefined
        key = line.accountId !== null ? `account-${line.accountId}` : "account-none"
        label = account ? `${account.code} — ${account.name}` : "Tanpa akun biaya"
      }

      const bucket = bucketFor(key, label)
      bucket.documentNos.push(bill.documentNo)
      bucket.dpp += dpp
      bucket.tax += tax
    }
  }

  return {
    result: buildPurchasesByDimension({
      lines: [...buckets.values()],
      dimension,
      documentCount: bills.length,
    }),
    ...rangePeriodLabels(period),
  }
}
