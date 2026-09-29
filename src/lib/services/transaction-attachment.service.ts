import type { TxClient } from "@/lib/db/prisma"
import { safeJsonParse } from "@/lib/utils/safe-parse"

/** Attach only temporary files uploaded by this user for this exact resource type. */
export async function attachPendingTransactionAttachments(
  tx: TxClient,
  input: {
    attachmentIds: unknown
    referenceType: string
    referenceId: number
    uploadedBy: number
  },
): Promise<void> {
  const parsed = typeof input.attachmentIds === "string"
    ? safeJsonParse<unknown>(input.attachmentIds)
    : input.attachmentIds
  if (parsed == null || parsed === "") return
  if (!Array.isArray(parsed)) throw new Error("Daftar lampiran tidak valid")

  const ids = [...new Set(parsed.map((value) => {
    const id = typeof value === "number" || typeof value === "string" ? Number(value) : NaN
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID lampiran tidak valid")
    return id
  }))]
  if (ids.length === 0) return

  await tx.transactionAttachment.updateMany({
    where: {
      id: { in: ids },
      referenceType: input.referenceType,
      referenceId: 0,
      uploadedBy: input.uploadedBy,
    },
    data: { referenceId: input.referenceId },
  })
}
