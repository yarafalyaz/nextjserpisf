/**
 * Loader read-only beban perintah kerja (F-2026-10-20-02, tahap backend aman).
 *
 * Dua query massal saja: WO aktif + baris ProductionCost yang menempel ke WO
 * tersebut. Tanpa N+1, tanpa mutasi, tanpa jurnal. Baris biaya yang hanya
 * terhubung ke ProductionOrder (workOrderId kosong) tidak ikut — atribusi
 * ke WO tidak ditebak. Agregasinya di builder murni `work-order-load.ts`.
 */

import { prisma } from "@/lib/db/prisma"
import { ACTIVE_WORK_ORDER_STATUSES } from "@/lib/reports/work-order-queue"
import { buildWorkOrderLoad, type WorkOrderLoad } from "@/lib/reports/work-order-load"

export async function getWorkOrderLoad(): Promise<WorkOrderLoad> {
  const workOrders = await prisma.workOrder.findMany({
    where: { status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } },
    select: { id: true, slug: true, documentNo: true, status: true },
    orderBy: [{ documentNo: "asc" }, { id: "asc" }],
  })
  if (workOrders.length === 0) return buildWorkOrderLoad([], [])

  const costs = await prisma.productionCost.findMany({
    where: { workOrderId: { in: workOrders.map((wo) => wo.id) } },
    select: { workOrderId: true, category: true, hours: true, amount: true },
  })

  return buildWorkOrderLoad(
    workOrders,
    costs
      .filter(
        (cost): cost is typeof cost & { workOrderId: number } => cost.workOrderId !== null,
      )
      .map((cost) => ({
        workOrderId: cost.workOrderId,
        category: cost.category,
        hours: cost.hours === null ? null : Number(cost.hours),
        amount: Number(cost.amount),
      })),
  )
}
