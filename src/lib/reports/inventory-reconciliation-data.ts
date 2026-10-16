/**
 * Pemuatan data untuk laporan pemeriksaan **Selisih Saldo Akun Persediaan dengan
 * Nilai Barang**.
 *
 * Dua sisi sengaja diambil dari sumber yang berbeda, dan itu intinya: sisi buku
 * besar dari jurnal (lewat `sumNetForAccount`, yang hanya menghitung jurnal
 * terposting), sisi nilai barang dari lapisan persediaan lewat mesin penilaian
 * bersama `stock-valuation.ts` — aturan penilaian yang sama dengan laporan
 * Valuasi Stok, supaya tidak ada dua definisi "nilai persediaan".
 */

import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { sumNetForAccount } from "@/lib/services/report-aggregation.service"
import { buildStockValuation } from "@/lib/reports/stock-valuation"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  buildInventoryReconciliation,
  type InventoryReconciliationResult,
} from "@/lib/reports/inventory-reconciliation"

export interface InventoryReconciliationReport {
  reconciliation: InventoryReconciliationResult
  periodLabel: string
  periodCaption: string
}

export async function loadInventoryReconciliation(period: {
  start: Date
  end: Date
}): Promise<InventoryReconciliationReport> {
  const settings = await getSystemSettings()
  const inventoryAccountId = settings.inventoryAccountId ?? null

  const [layers, warehouses] = await Promise.all([
    prisma.inventoryLayer.findMany({
      where: { remaining: { gt: 0 } },
      include: {
        item: {
          select: {
            sku: true,
            name: true,
            unitOfMeasure: true,
            cost: true,
            costingMethod: true,
            category: { select: { name: true, costingMethod: true } },
          },
        },
      },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
  ])

  const account = inventoryAccountId
    ? await prisma.account.findUnique({
        where: { id: inventoryAccountId },
        select: { code: true, name: true },
      })
    : null

  const warehouseMap = new Map(warehouses.map((warehouse) => [warehouse.id, { name: warehouse.name, code: warehouse.code }]))

  const valuation = buildStockValuation(
    layers.map((layer) => ({
      itemId: layer.itemId,
      warehouseId: layer.warehouseId,
      remaining: Number(layer.remaining),
      unitCost: Number(layer.unitCost),
      item: {
        sku: layer.item.sku,
        name: layer.item.name,
        unitOfMeasure: layer.item.unitOfMeasure,
        cost: Number(layer.item.cost ?? 0),
        costingMethod: layer.item.costingMethod,
        category: layer.item.category
          ? { name: layer.item.category.name, costingMethod: layer.item.category.costingMethod }
          : null,
      },
    })),
    (warehouseId) => warehouseMap.get(warehouseId ?? 0),
  )

  const ledgerBalance = inventoryAccountId
    ? await sumNetForAccount(inventoryAccountId, { date: { lte: period.end } })
    : null

  const today = new Date()
  const periodEndIsToday =
    period.end.getFullYear() === today.getFullYear() &&
    period.end.getMonth() === today.getMonth() &&
    period.end.getDate() === today.getDate()

  return {
    reconciliation: buildInventoryReconciliation({
      valuation: { qty: valuation.totals.qty, value: valuation.totals.value, byWarehouse: valuation.byWarehouse },
      ledger:
        ledgerBalance === null
          ? null
          : {
              accountLabel: account ? `${account.code} ${account.name}` : String(inventoryAccountId),
              balance: ledgerBalance,
            },
      periodEndIsToday,
    }),
    ...rangePeriodLabels(period),
  }
}
