import { describe, expect, it, vi } from "vitest"
import type { TxClient } from "@/lib/db/prisma"
import { attachPendingTransactionAttachments } from "../transaction-attachment.service"

describe("attachPendingTransactionAttachments", () => {
  it("only reassigns the current user's temporary files for the requested type", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 })
    const tx = { transactionAttachment: { updateMany } } as unknown as TxClient

    await attachPendingTransactionAttachments(tx, {
      attachmentIds: '[10,"11",10]',
      referenceType: "vendor_bill",
      referenceId: 27,
      uploadedBy: 4,
    })

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [10, 11] },
        referenceType: "vendor_bill",
        referenceId: 0,
        uploadedBy: 4,
      },
      data: { referenceId: 27 },
    })
  })

  it("rejects malformed attachment ID lists", async () => {
    const updateMany = vi.fn()
    const tx = { transactionAttachment: { updateMany } } as unknown as TxClient

    await expect(attachPendingTransactionAttachments(tx, {
      attachmentIds: '["not-an-id"]',
      referenceType: "expense",
      referenceId: 3,
      uploadedBy: 4,
    })).rejects.toThrow(/ID lampiran tidak valid/i)
    expect(updateMany).not.toHaveBeenCalled()
  })
})
