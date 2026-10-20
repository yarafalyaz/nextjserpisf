/**
 * Loader read-only papan antrian bengkel (F-2026-10-20-28(a)).
 *
 * Satu query massal WO aktif (draft/pending/in_progress) lengkap dengan
 * pelanggan + kendaraan — bukan per-WO (tanpa N+1). Penyaringan status,
 * urutan tenggat, umur, dan bendera terlambat ada di builder murni
 * `work-order-queue.ts`; loader hanya memetakan relasi jadi label tampil.
 *
 * Read-only: tanpa migrasi, tanpa jurnal, tanpa mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import {
  ACTIVE_WORK_ORDER_STATUSES,
  buildWorkOrderQueue,
  type WorkOrderQueue,
} from "@/lib/reports/work-order-queue"

export async function getWorkOrderQueue(now: Date = new Date()): Promise<WorkOrderQueue> {
  const workOrders = await prisma.workOrder.findMany({
    where: { status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      date: true,
      startDate: true,
      endDate: true,
      customer: { select: { name: true } },
      customerVehicle: {
        select: { plateNumber: true, vehicle: { select: { name: true } } },
      },
    },
    orderBy: [{ endDate: "asc" }, { documentNo: "asc" }],
  })

  return buildWorkOrderQueue(
    workOrders.map((wo) => {
      const cv = wo.customerVehicle
      const parts = cv
        ? [cv.plateNumber, cv.vehicle?.name].filter(
            (part): part is string => typeof part === "string" && part.length > 0,
          )
        : []
      return {
        id: wo.id,
        slug: wo.slug,
        documentNo: wo.documentNo,
        status: wo.status,
        date: wo.date,
        startDate: wo.startDate,
        endDate: wo.endDate,
        customerName: wo.customer?.name ?? null,
        vehicleLabel: parts.length ? parts.join(" · ") : cv ? "Kendaraan tanpa plat" : null,
      }
    }),
    now,
  )
}
