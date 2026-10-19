/**
 * Data laporan varians produksi — satu sumber untuk halaman dan PDF, sehingga
 * angka di layar dan di PDF tidak mungkin berbeda.
 *
 * Periode difilter pada `createdAt` order: itulah cap waktu yang selalu ada
 * (startDate/endDate boleh kosong) dan indeksnya sudah ada di schema.
 * Tiga query saja untuk seluruh periode — order, bahan, dan biaya diambil
 * massal lalu digabung di memori, bukan per-order (N+1).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildProductionVariance,
  type ProductionVarianceResult,
} from "@/lib/reports/production-variance"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface ProductionVarianceReport {
  variance: ProductionVarianceResult
  periodLabel: string
  periodCaption: string
}

export async function loadProductionVariance(period: {
  start: Date
  end: Date
}): Promise<ProductionVarianceReport> {
  const labels = rangePeriodLabels(period)
  const orders = await prisma.productionOrder.findMany({
    where: { createdAt: { gte: period.start, lte: period.end } },
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
  if (orders.length === 0) {
    return {
      variance: buildProductionVariance({ orders: [], start: period.start, end: period.end }),
      ...labels,
    }
  }

  const orderIds = orders.map((order) => order.id)
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
  for (const material of materials) {
    const list = materialsByOrder.get(material.productionOrderId) ?? []
    list.push(material)
    materialsByOrder.set(material.productionOrderId, list)
  }
  const costsByOrder = new Map<number, typeof costs>()
  for (const cost of costs) {
    if (cost.productionOrderId === null) continue
    const list = costsByOrder.get(cost.productionOrderId) ?? []
    list.push(cost)
    costsByOrder.set(cost.productionOrderId, list)
  }

  return {
    variance: buildProductionVariance({
      orders: orders.map((order) => ({
        id: order.id,
        documentNo: order.workOrder ? `${order.documentNo} · ${order.workOrder.documentNo}` : order.documentNo,
        date: order.createdAt,
        status: order.status,
        productName: order.product?.name ?? null,
        totalStandardCost: Number(order.totalStandardCost),
        totalActualCost: Number(order.totalActualCost),
        releasedCost: Number(order.releasedCost),
        recordedVariance: Number(order.variance),
        materials: (materialsByOrder.get(order.id) ?? []).map((material) => ({
          itemId: material.itemId,
          qty: Number(material.qty),
          actualQty: material.actualQty === null ? null : Number(material.actualQty),
          standardCost: Number(material.standardCost),
          actualCost: Number(material.actualCost),
        })),
        costs: (costsByOrder.get(order.id) ?? []).map((cost) => ({
          category: cost.category,
          amount: Number(cost.amount),
        })),
      })),
      start: period.start,
      end: period.end,
    }),
    ...labels,
  }
}
