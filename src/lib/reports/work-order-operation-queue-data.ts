/**
 * Loader baca-saja antrean operasi perintah kerja mengendap lintas WO
 * (F-2026-10-27-100-S, 100-B+F).
 *
 * Fail-closed SEBELUM query (BR-WOOQ-07, Q-WOOQ-5): izin
 * `view_work_orders` — persis gerbang halaman perintah kerja existing,
 * tanpa key baru — ditegakkan di sini sebelum query apa pun. Loader
 * TIDAK menyaring per WO/stasiun/penanggung tahap 1 (BR-WOOQ-07).
 *
 * Anti-N+1 (BR-WOOQ-11): satu query operasi populasi dengan relasi
 * WO induk + stasiun + penanggung ter-include massal — bukan query
 * per baris. Penanda terhalang dihitung builder dari set yang sama.
 * `notes` SENGAJA tidak dibaca (BR-WOOQ-12); tidak ada bacaan
 * rekod biaya/jam aktual existing (BR-WOOQ-09).
 *
 * Baca-saja mutlak: hanya `findMany`; tidak memanggil aksi tulis
 * WO/operasi existing dan tidak menulis apa pun. Populasi disaring
 * ulang oleh builder murni `work-order-operation-queue.ts`.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildWorkOrderOperationQueue,
  type WorkOrderOperationQueue,
  type WorkOrderOperationQueueInput,
} from "@/lib/reports/work-order-operation-queue"

export interface WorkOrderOperationQueueOptions {
  now?: Date
  limit?: number
}

export async function getWorkOrderOperationQueue(
  options: WorkOrderOperationQueueOptions = {},
): Promise<WorkOrderOperationQueue> {
  await requirePermission("view_work_orders")

  const operations = await prisma.workOrderOperation.findMany({
    where: { status: { in: ["pending", "in_progress"] } },
    select: {
      id: true,
      workOrderId: true,
      workCenterId: true,
      name: true,
      sortOrder: true,
      status: true,
      estimatedHours: true,
      assignedEmployeeId: true,
      startedAt: true,
      createdAt: true,
      updatedAt: true,
      workOrder: {
        select: { slug: true, documentNo: true, status: true, endDate: true },
      },
      workCenter: { select: { name: true } },
      assignedEmployee: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const inputs: WorkOrderOperationQueueInput[] = operations.map((op) => ({
    operationId: op.id,
    workOrderId: op.workOrderId,
    workOrderSlug: op.workOrder.slug,
    documentNo: op.workOrder.documentNo,
    workOrderStatus: op.workOrder.status,
    workOrderEndDate: op.workOrder.endDate,
    name: op.name,
    sortOrder: op.sortOrder,
    status: op.status,
    workCenterId: op.workCenterId,
    workCenterName: op.workCenter?.name ?? null,
    assignedEmployeeId: op.assignedEmployeeId,
    assigneeName: op.assignedEmployee?.name ?? null,
    estimatedHours: op.estimatedHours == null ? null : Number(op.estimatedHours),
    createdAt: op.createdAt,
    startedAt: op.startedAt,
    updatedAt: op.updatedAt,
  }))

  return buildWorkOrderOperationQueue(inputs, options.now ?? new Date(), options.limit)
}
