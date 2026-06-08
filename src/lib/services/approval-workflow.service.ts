import { prisma } from "@/lib/db/prisma"

/**
 * Generic approval-workflow integration.
 *
 * The Approval engine (ApprovalWorkflow + steps + Approval + ApprovalHistory)
 * exists but documents never created Approval records nor blocked on them.
 * These helpers connect business documents to the engine WITHOUT forcing
 * configuration: if no active workflow is defined for a document type, they are
 * a no-op, so existing flows are unaffected until an admin configures a workflow.
 */

/**
 * If an active approval workflow exists for `referenceType`, create a pending
 * Approval for the document (idempotent). Returns true if an approval is now
 * required/pending for this document.
 */
export async function requestApprovalIfConfigured(
  referenceType: string,
  referenceId: number,
  requestedBy?: number
): Promise<boolean> {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { modelType: referenceType, isActive: true, deletedAt: null },
    orderBy: { priority: "desc" },
  })
  if (!workflow) return false

  const existing = await prisma.approval.findFirst({
    where: { referenceType, referenceId },
  })
  if (existing) return existing.status === "pending"

  await prisma.approval.create({
    data: {
      workflowId: workflow.id,
      referenceType,
      referenceId,
      currentStep: 1,
      status: "pending",
      requestedBy: requestedBy ?? null,
      requestedAt: new Date(),
    },
  })
  return true
}

/**
 * Throw if the document has an approval that is not yet fully approved.
 * No approval record (no workflow configured) → allowed.
 */
export async function assertApproved(referenceType: string, referenceId: number): Promise<void> {
  const approval = await prisma.approval.findFirst({
    where: { referenceType, referenceId },
    orderBy: { id: "desc" },
  })
  if (!approval) return // no workflow / not routed → no gate
  if (approval.status === "approved") return
  if (approval.status === "rejected") {
    throw new Error("Dokumen ditolak pada alur persetujuan dan tidak dapat dilanjutkan.")
  }
  throw new Error("Dokumen masih menunggu persetujuan (approval workflow) sebelum dapat dilanjutkan.")
}
