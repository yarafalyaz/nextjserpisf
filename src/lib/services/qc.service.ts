import { prisma, TxClient } from "@/lib/db/prisma"

/**
 * Quality-control domain service (PRD FAB-10, FAB-11, FAB-13).
 */

export const QC_INSPECTION_TYPES = ["incoming", "in_process", "final"] as const
export type QcInspectionType = (typeof QC_INSPECTION_TYPES)[number]

export const NONCONFORMANCE_STATUSES = ["open", "rework", "rework_done", "rejected", "closed"] as const
export type NonconformanceStatus = (typeof NONCONFORMANCE_STATUSES)[number]

/** Terminal, no-longer-blocking NCR statuses. `open`/`rework` block handover. */
const OPEN_NCR_STATUSES = ["open", "rework", "rejected"]

/**
 * Resolve the active released checklist for a product + type. Falls back to a
 * product-agnostic (productId = null) checklist of the same type when the
 * product has no dedicated released checklist. Returns null when none exist.
 */
export async function resolveActiveChecklist(
  checklistType: QcInspectionType,
  productId: number | null,
  client: TxClient | typeof prisma = prisma,
) {
  const released = await client.qcChecklist.findFirst({
    where: {
      checklistType,
      isActive: true,
      status: "released",
      ...(productId ? { OR: [{ productId }, { productId: null }] } : {}),
    },
    orderBy: [{ productId: "desc" }, { version: "desc" }],
    include: { items: { orderBy: { sortOrder: "asc" } } },
  })
  return released
}

/**
 * Assert a work order is cleared for handover per FAB-11/FAB-13: it must have a
 * completed `final` inspection that PASSED, and must have no open
 * nonconformance. Throws a descriptive error otherwise.
 *
 * A work order with no QC records at all is allowed to pass (opt-in QC): QC is
 * enforced only once the shop starts recording inspections, so legacy/simple
 * jobs remain completable. This mirrors the PRD stance that QC is a gate where
 * configured, not an unconditional block on every job.
 */
export async function assertWorkOrderQcCleared(
  workOrderId: number,
  client: TxClient | typeof prisma = prisma,
): Promise<void> {
  const referenceFilter = { referenceType: "WorkOrder", referenceId: workOrderId }

  const openNcr = await client.nonconformance.count({
    where: { ...referenceFilter, status: { in: OPEN_NCR_STATUSES } },
  })
  if (openNcr > 0) {
    throw new Error(
      `Tidak dapat menyelesaikan WO: masih ada ${openNcr} nonconformance (NCR) terbuka yang harus diselesaikan.`,
    )
  }

  const inspections = await client.qcInspection.findMany({
    where: { ...referenceFilter, inspectionType: "final" },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  })

  // If any final inspection exists, the latest one must be `passed`.
  if (inspections.length > 0 && inspections[0].status !== "passed") {
    throw new Error(
      `Tidak dapat menyelesaikan WO: inspeksi akhir berstatus '${inspections[0].status}', harus 'passed' sebelum serah terima.`,
    )
  }
}
