import { describe, expect, it, vi } from "vitest"
import type { TxClient } from "@/lib/db/prisma"
import {
  attachPendingTransactionAttachments,
  deleteTransactionAttachmentsTx,
  publishPhotoAttachmentTx,
  removeAttachmentFiles,
  verifyPhotoAttachmentTx,
} from "../transaction-attachment.service"

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
        // Jangkar guard: klaim HANYA baris sementara milik pengunggah. Mutasi
        // referenceId 0 -> milik dokumen lain, mutasi uploadedBy -> milik orang
        // lain — keduanya harus memerahkan tes ini.
        referenceId: 0,
        uploadedBy: 4,
      },
      data: { referenceId: 27 },
    })
  })

  it("tidak merebut lampiran milik pengguna lain (uploadedBy dijaga)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const tx = { transactionAttachment: { updateMany } } as unknown as TxClient

    await attachPendingTransactionAttachments(tx, {
      attachmentIds: "[10]",
      referenceType: "vendor_bill",
      referenceId: 27,
      uploadedBy: 4,
    })

    const where = updateMany.mock.calls[0][0].where as Record<string, unknown>
    expect(where.uploadedBy).toBe(4)
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

describe("deleteTransactionAttachmentsTx", () => {
  it("membaca baris target lalu menghapusnya dengan where yang sama", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { fileUrl: "/api/attachments/Expense/a.pdf", referenceType: "Expense" },
    ])
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 })
    const tx = { transactionAttachment: { findMany, deleteMany } } as unknown as TxClient

    const rows = await deleteTransactionAttachmentsTx(tx, {
      referenceType: "Expense",
      referenceId: 9,
    })

    // Jangkar guard: where baca dan where hapus WAJIB identik — kalau hapus
    // memakai where lebih longgar/ketat dari yang dibaca, berkas yang
    // di-unlink fase 2 tidak sama dengan baris yang dihapus.
    const readWhere = findMany.mock.calls[0][0].where as Record<string, unknown>
    const deleteWhere = deleteMany.mock.calls[0][0].where as Record<string, unknown>
    expect(readWhere).toEqual({ referenceType: "Expense", referenceId: 9 })
    expect(deleteWhere).toEqual(readWhere)
    expect(rows).toHaveLength(1)
  })

  it("tidak menyentuh DB bila tak ada baris", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const deleteMany = vi.fn()
    const tx = { transactionAttachment: { findMany, deleteMany } } as unknown as TxClient

    await expect(deleteTransactionAttachmentsTx(tx, {
      referenceType: "Expense",
      referenceId: 9,
    })).resolves.toEqual([])
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it("removeAttachmentFiles melewati path traversal tanpa unlink dan tanpa error", async () => {
    const unlinkFn = vi.fn().mockResolvedValue(undefined)
    // Traversal membuat relative lolos guard — fungsi harus skip SEBELUM
    // unlink; sukses = unlink tak dipanggil dan tak ada throw.
    await expect(removeAttachmentFiles([
      { fileUrl: "/api/attachments/Expense/../../../../etc/x", referenceType: "Expense" },
    ], unlinkFn)).resolves.toBeUndefined()
    expect(unlinkFn).not.toHaveBeenCalled()
  })

  it("removeAttachmentFiles meng-unlink berkas sah dan mencatat gagal-unlink", async () => {
    const unlinkFn = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("ENOENT"))
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      await removeAttachmentFiles([
        { fileUrl: "/api/attachments/Expense/a.pdf", referenceType: "Expense" },
        { fileUrl: "/api/attachments/Expense/b.pdf", referenceType: "Expense" },
      ], unlinkFn)
      expect(unlinkFn).toHaveBeenCalledTimes(2)
      expect(unlinkFn.mock.calls[0][0]).toContain("a.pdf")
      // Gagal unlink = log berkonteks, bukan throw — hapus DB tetap sukses.
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining("[deleteTransactionAttachments]"),
        expect.any(Error),
      )
    } finally {
      errSpy.mockRestore()
    }
  })
})

describe("verify/publish foto F-096-S", () => {
  function photoTx(row: Record<string, unknown> | null) {
    const update = vi.fn().mockResolvedValue({})
    const findUnique = vi.fn().mockResolvedValue(row)
    return { tx: { transactionAttachment: { findUnique, update } }, update }
  }
  const base = { id: 5, photoCategory: "progress", uploadedBy: 3, verifiedBy: null, publishedBy: null }

  it("verifikasi menulis verifiedBy/At", async () => {
    const { tx, update } = photoTx({ ...base })
    await verifyPhotoAttachmentTx(tx as never, { attachmentId: 5, verifiedBy: 7, now: new Date(0) })
    expect(update).toHaveBeenCalledWith({ where: { id: 5 }, data: { verifiedBy: 7, verifiedAt: new Date(0) } })
  })

  it("pengunggah tidak boleh verifikasi foto handover sendiri (BR-PHOTO-06 default)", async () => {
    const { tx } = photoTx({ ...base, photoCategory: "handover" })
    await expect(verifyPhotoAttachmentTx(tx as never, { attachmentId: 5, verifiedBy: 3 })).rejects.toThrow(/pengunggahnya sendiri/)
  })

  it("terbit menolak foto belum terverifikasi dan kategori defect", async () => {
    const a = photoTx({ ...base })
    await expect(publishPhotoAttachmentTx(a.tx as never, { attachmentId: 5, publishedBy: 8 })).rejects.toThrow(/terverifikasi/)
    const b = photoTx({ ...base, photoCategory: "defect", verifiedBy: 7 })
    await expect(publishPhotoAttachmentTx(b.tx as never, { attachmentId: 5, publishedBy: 8 })).rejects.toThrow(/tidak boleh ditandai terbit/)
  })
})
