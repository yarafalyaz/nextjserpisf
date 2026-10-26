import { prisma } from "@/lib/db/prisma"
import { nextSlug } from "@/lib/utils/slug-db"

/**
 * Generic approval-workflow integration.
 * Kalau status sebelumnya `rejected`, buka approval baru (resubmit) supaya
 * dokumen bisa diajukan ulang — sebelumnya CONFLICT terminal.
 */

export async function requestApprovalIfConfigured(
  referenceType: string,
  referenceId: number,
  requestedBy?: number,
  txClient?: any,
): Promise<boolean> {
  const createApproval = async (db: any, workflowId: number): Promise<true> => {
    await db.approval.create({
      data: {
        workflowId,
        referenceType,
        slug: await nextSlug("approval", referenceType),
        referenceId,
        currentStep: 1,
        status: "pending",
        requestedBy: requestedBy ?? null,
        requestedAt: new Date(),
      },
    })
    return true
  }

  const request = async (db: any): Promise<boolean> => {
    const [lockedWorkflow] = await db.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM approval_workflows
      WHERE model_type = ${referenceType} AND is_active = 1 AND deleted_at IS NULL
      ORDER BY priority DESC
      LIMIT 1 FOR UPDATE
    `
    if (!lockedWorkflow) return false

    const existing = await db.approval.findFirst({
      where: { referenceType, referenceId },
      orderBy: { id: "desc" },
    })
    if (existing) {
      if (existing.status === "pending") return true
      if (existing.status === "rejected") return createApproval(db, lockedWorkflow.id)
      return false
    }

    return createApproval(db, lockedWorkflow.id)
  }

  if (txClient) return request(txClient)
  return prisma.$transaction((tx) => request(tx))
}

export async function assertApproved(referenceType: string, referenceId: number): Promise<void> {
  if (!prisma.approval) return
  const approval = await prisma.approval.findFirst({
    where: { referenceType, referenceId },
    orderBy: { id: "desc" },
  })
  if (!approval) return
  if (approval.status === "approved") return
  if (approval.status === "rejected") {
    throw new Error("Dokumen ditolak pada alur persetujuan dan tidak dapat dilanjutkan.")
  }
  throw new Error("Dokumen masih menunggu persetujuan (approval workflow) sebelum dapat dilanjutkan.")
}
