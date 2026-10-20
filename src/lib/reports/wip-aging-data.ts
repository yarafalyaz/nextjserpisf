/**
 * Loader read-only laporan umur WIP (F-2026-10-20-72).
 *
 * Satu query massal: ProductionOrder berstatus berjalan saja. Tanpa N+1,
 * tanpa mutasi, tanpa jurnal. Agregasi + ember umur di builder murni
 * `wip-aging.ts`. Saldo GL akun WIP tidak dibaca di sini — rekonsiliasi
 * total laporan terhadap saldo GL adalah pembanding di lapisan halaman,
 * bukan syarat builder (saldo GL memuat jurnal WIP jalur lain).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildWipAging,
  WIP_AGING_RUNNING_STATUSES,
  type WipAging,
} from "@/lib/reports/wip-aging"

export async function getWipAging(asOf: Date = new Date()): Promise<WipAging> {
  const orders = await prisma.productionOrder.findMany({
    where: { status: { in: [...WIP_AGING_RUNNING_STATUSES] } },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      startDate: true,
      createdAt: true,
      qty: true,
      completedQty: true,
      totalActualCost: true,
      releasedCost: true,
      product: { select: { name: true } },
      workOrder: { select: { documentNo: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  return buildWipAging({
    asOf,
    orders: orders.map((order) => ({
      id: order.id,
      slug: order.slug,
      documentNo: order.documentNo,
      status: order.status,
      startDate: order.startDate,
      createdAt: order.createdAt,
      qty: Number(order.qty),
      completedQty: Number(order.completedQty),
      totalActualCost: Number(order.totalActualCost),
      releasedCost: Number(order.releasedCost),
      productName: order.product.name,
      workOrderDocumentNo: order.workOrder?.documentNo ?? null,
    })),
  })
}
