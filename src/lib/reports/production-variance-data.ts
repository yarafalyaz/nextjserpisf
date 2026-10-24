/**
 * Data laporan varians produksi — satu sumber untuk halaman dan PDF, sehingga
 * angka di layar dan di PDF tidak mungkin berbeda.
 *
 * Periode difilter pada `createdAt` order: itulah cap waktu yang selalu ada
 * (startDate/endDate boleh kosong) dan indeksnya sudah ada di schema.
 * Query massal per jendela — order, bahan, dan biaya diambil sekali lalu
 * digabung di memori, bukan per-order (N+1).
 *
 * F-2026-10-21-010: kandidat re-cost standar butuh rantai periode. Loader
 * mengambil jendela berjalan 12 bulan kalender yang berakhir di bulan
 * `period.end`, membaginya per bulan, lalu `findRecalibrationCandidates`
 * menandai item dengan |varians harga| > 5% dari standar selama 3 bulan
 * beruntun. Item absen satu bulan memutus rantai. Tanpa migrasi, tanpa
 * tulisan ke master — aksi re-cost tetap manual `calculateStandardCost`.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildProductionVariance,
  findRecalibrationCandidates,
  type ProductionVarianceOrderInput,
  type ProductionVarianceResult,
} from "@/lib/reports/production-variance"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface ProductionVarianceReport {
  variance: ProductionVarianceResult
  periodLabel: string
  periodCaption: string
}

const RECALIBRATION_WINDOW_MONTHS = 12
const RECALIBRATION_THRESHOLD_PCT = 5
const RECALIBRATION_CONSECUTIVE = 3

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

type RawOrder = Awaited<ReturnType<typeof fetchOrders>>[number]

async function fetchOrders(start: Date, end: Date) {
  return prisma.productionOrder.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: {
      id: true,
      documentNo: true,
      createdAt: true,
      status: true,
      totalStandardCost: true,
      totalActualCost: true,
      releasedCost: true,
      variance: true,
      product: { select: { name: true } },
      workOrder: { select: { documentNo: true } },
    },
    orderBy: { createdAt: "asc" },
  })
}

async function toInputs(orders: RawOrder[]): Promise<ProductionVarianceOrderInput[]> {
  if (orders.length === 0) return []
  const orderIds = orders.map((o) => o.id)
  const [materials, costs] = await Promise.all([
    prisma.productionOrderMaterial.findMany({
      where: { productionOrderId: { in: orderIds } },
      select: {
        productionOrderId: true,
        itemId: true,
        qty: true,
        actualQty: true,
        standardCost: true,
        actualCost: true,
      },
    }),
    prisma.productionCost.findMany({
      where: { productionOrderId: { in: orderIds } },
      select: { productionOrderId: true, category: true, amount: true },
    }),
  ])
  const materialsByOrder = new Map<number, typeof materials>()
  for (const m of materials) {
    const list = materialsByOrder.get(m.productionOrderId) ?? []
    list.push(m)
    materialsByOrder.set(m.productionOrderId, list)
  }
  const costsByOrder = new Map<number, typeof costs>()
  for (const c of costs) {
    if (c.productionOrderId === null) continue
    const list = costsByOrder.get(c.productionOrderId) ?? []
    list.push(c)
    costsByOrder.set(c.productionOrderId, list)
  }
  return orders.map((order) => ({
    id: order.id,
    documentNo: order.workOrder ? `${order.documentNo} · ${order.workOrder.documentNo}` : order.documentNo,
    date: order.createdAt,
    status: order.status,
    productName: order.product?.name ?? null,
    totalStandardCost: Number(order.totalStandardCost),
    totalActualCost: Number(order.totalActualCost),
    releasedCost: Number(order.releasedCost),
    recordedVariance: Number(order.variance),
    materials: (materialsByOrder.get(order.id) ?? []).map((m) => ({
      itemId: m.itemId,
      qty: Number(m.qty),
      actualQty: m.actualQty === null ? null : Number(m.actualQty),
      standardCost: Number(m.standardCost),
      actualCost: Number(m.actualCost),
    })),
    costs: (costsByOrder.get(order.id) ?? []).map((c) => ({
      category: c.category,
      amount: Number(c.amount),
    })),
  }))
}

export async function loadProductionVariance(period: {
  start: Date
  end: Date
}): Promise<ProductionVarianceReport> {
  const labels = rangePeriodLabels(period)

  // Jendela rekalibrasi: 12 bulan kalender berakhir di bulan period.end.
  const windowEndMonth = monthStart(period.end)
  const windowStart = addMonths(windowEndMonth, -(RECALIBRATION_WINDOW_MONTHS - 1))
  const windowEnd = new Date(addMonths(windowEndMonth, 1).getTime() - 1)

  const fetchStart = period.start < windowStart ? period.start : windowStart
  const fetchEnd = period.end > windowEnd ? period.end : windowEnd
  const allOrders = await fetchOrders(fetchStart, fetchEnd)
  const allInputs = await toInputs(allOrders)

  // Bucket per bulan kalender untuk rantai beruntun.
  const buckets: ProductionVarianceOrderInput[][] = []
  for (let i = 0; i < RECALIBRATION_WINDOW_MONTHS; i++) {
    const mStart = addMonths(windowStart, i)
    const mEnd = new Date(addMonths(mStart, 1).getTime() - 1)
    buckets.push(allInputs.filter((o) => o.date >= mStart && o.date <= mEnd))
  }
  const recalibrationCandidates = findRecalibrationCandidates({
    periods: buckets,
    thresholdPct: RECALIBRATION_THRESHOLD_PCT,
    consecutivePeriods: RECALIBRATION_CONSECUTIVE,
  })

  let itemNames: Map<number, string> | undefined
  if (recalibrationCandidates.length > 0) {
    const rows = await prisma.item.findMany({
      where: { id: { in: recalibrationCandidates.map((c) => c.itemId) } },
      select: { id: true, name: true, sku: true },
    })
    itemNames = new Map(rows.map((r) => [r.id, `${r.name} (${r.sku})`]))
  }

  const visible = allInputs.filter((o) => o.date >= period.start && o.date <= period.end)
  return {
    variance: buildProductionVariance({
      orders: visible,
      start: period.start,
      end: period.end,
      recalibrationCandidates,
      itemNames,
      recalibrationMeta: {
        periodCount: RECALIBRATION_WINDOW_MONTHS,
        thresholdPct: RECALIBRATION_THRESHOLD_PCT,
        consecutivePeriods: RECALIBRATION_CONSECUTIVE,
      },
    }),
    ...labels,
  }
}
