/** Loader read-only progres tahap WO (F-020 A) — query massal relasi terurut, builder murni. */

import { prisma } from "@/lib/db/prisma"
import {
  buildWorkOrderProgress,
  type WorkOrderProgressReport,
} from "@/lib/reports/work-order-progress"

export async function getWorkOrderProgress(
  workOrderId: number,
): Promise<(WorkOrderProgressReport & { workOrderStatus: string }) | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      status: true,
      operations: {
        select: {
          id: true,
          name: true,
          sortOrder: true,
          status: true,
          assignedEmployeeId: true,
          estimatedHours: true,
          notes: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  })
  if (!wo) return null

  return {
    workOrderStatus: wo.status,
    ...buildWorkOrderProgress({
      operations: wo.operations.map((op) => ({
        id: op.id,
        name: op.name,
        sortOrder: op.sortOrder,
        status: op.status,
        assignedEmployeeId: op.assignedEmployeeId,
        estimatedHours: op.estimatedHours == null ? null : Number(op.estimatedHours),
        notes: op.notes,
      })),
    }),
  }
}
