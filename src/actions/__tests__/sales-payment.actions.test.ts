import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const deleteJournalByRefMock = vi.fn()
const deleteJournalByRefTxMock = vi.fn()
const onPaymentCreatedMock = vi.fn()
const onPaymentUpdatedMock = vi.fn()
const transactionMock = vi.fn()

const paymentFindUniqueOrThrowMock = vi.fn()
const paymentUpdateMock = vi.fn()
const paymentAggregateMock = vi.fn()
const invoiceFindUniqueOrThrowMock = vi.fn()
const execRawMock = vi.fn()
const attachmentUpdateManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesPayment: {
      findUniqueOrThrow: (...a: unknown[]) => paymentFindUniqueOrThrowMock(...a),
      aggregate: (...a: unknown[]) => paymentAggregateMock(...a),
      update: (...a: unknown[]) => paymentUpdateMock(...a),
    },
    salesInvoice: { findUniqueOrThrow: (...a: unknown[]) => invoiceFindUniqueOrThrowMock(...a) },
    account: { count: vi.fn().mockResolvedValue(0) },
    transactionAttachment: { updateMany: (...a: unknown[]) => attachmentUpdateManyMock(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
    $executeRaw: (...a: unknown[]) => execRawMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(), onSalesPaymentCreated: (...a: unknown[]) => onPaymentCreatedMock(...a),
  onSalesReturnCompleted: vi.fn(), onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: (...a: unknown[]) => deleteJournalByRefMock(...a),
  deleteJournalByReferenceTx: (...a: unknown[]) => deleteJournalByRefTxMock(...a),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: (...a: unknown[]) => onPaymentCreatedMock(...a),
  onSalesPaymentUpdated: (...a: unknown[]) => onPaymentUpdatedMock(...a),
  onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn(async () => "PAY-0001") }))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

import { updateSalesPayment } from "../sales.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

function wireTransaction(journalValue: unknown = null) {
  const tx = {
    $executeRaw: (...a: unknown[]) => execRawMock(...a),
    journal: { findFirst: vi.fn().mockResolvedValue(journalValue) },
    salesPayment: {
      findUniqueOrThrow: (...a: unknown[]) => paymentFindUniqueOrThrowMock(...a),
      aggregate: (...a: unknown[]) => paymentAggregateMock(...a),
      update: (...a: unknown[]) => paymentUpdateMock(...a),
    },
    salesInvoice: { findUniqueOrThrow: (...a: unknown[]) => invoiceFindUniqueOrThrowMock(...a) },
    account: { count: vi.fn().mockResolvedValue(0) },
    transactionAttachment: { updateMany: (...a: unknown[]) => attachmentUpdateManyMock(...a) },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, deleteJournalByRefMock, deleteJournalByRefTxMock,
    onPaymentCreatedMock, onPaymentUpdatedMock, transactionMock,
    paymentFindUniqueOrThrowMock, paymentUpdateMock, paymentAggregateMock,
    invoiceFindUniqueOrThrowMock, execRawMock, attachmentUpdateManyMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  // GL-BR-003 P3: lockedPayment select diperluas (tanggal/akun/nominal/
  // withholding/metode) — baris tanpa jurnal = jalur posted lama.
  paymentFindUniqueOrThrowMock.mockResolvedValue({
    salesInvoiceId: 50, documentNo: "PAY-0001", status: "posted",
    paymentDate: new Date("2026-06-09"), accountId: null, amount: 100,
    withholdingAmount: 0, withholdingTypeId: null, paymentMethod: "cash",
  })
  invoiceFindUniqueOrThrowMock.mockResolvedValue({ id: 50, grandTotal: 1000, customerId: 3, status: "posted" })
  paymentAggregateMock.mockResolvedValue({ _sum: { amount: 200 } }) // 200 already paid by others
  paymentUpdateMock.mockResolvedValue({ id: 9, salesInvoiceId: 50 })
  execRawMock.mockResolvedValue(undefined)
  wireTransaction()
})

describe("updateSalesPayment overpay guard", () => {
  it("rejects an edit that pushes total paid past grandTotal", async () => {
    // grandTotal 1000, others paid 200 → remaining 800. Editing this payment to
    // 900 would overpay.
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "900", paymentDate: "2026-06-09", paymentMethod: "cash",
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("melebihi sisa tagihan")
    expect(paymentUpdateMock).not.toHaveBeenCalled()
  })

  it("rejects a non-positive amount", async () => {
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "0", paymentDate: "2026-06-09", paymentMethod: "cash",
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("lebih dari 0")
  })

  // FIN-BR-006: satu helper bersama dua lewat-sisa batas (dalam vs luar Rp1).
  async function editPaymentTo(amount: string) {
    return updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount, paymentDate: "2026-06-09", paymentMethod: "transfer",
    }))
  }

  it("FIN-BR-006: edit lewat sisa dalam toleransi Rp1 tetap lolos (pembulatan rupiah-penuh)", async () => {
    // grandTotal 1000, others paid 200 → remaining 800. Edit ke 800.50
    // melebihi sisa 0.50 — dalam toleransi Rp1, bukan overpay.
    const result = await editPaymentTo("800.50")
    expect(result.success).toBe(true)
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 }, data: expect.objectContaining({ amount: 800.5 }) }),
    )
  })

  it("FIN-BR-006: edit lewat sisa di atas toleransi tetap ditolak", async () => {
    // remaining 800; edit ke 802 melebihi 2.00 — di atas toleransi Rp1.
    const result = await editPaymentTo("802")
    expect(result.success).toBe(false)
    expect(result.error).toContain("melebihi sisa tagihan")
    expect(paymentUpdateMock).not.toHaveBeenCalled()
  })

  it("allows an edit within the remaining balance and resyncs the GL", async () => {
    // remaining 800; editing to 800 is exactly allowed.
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "800", paymentDate: "2026-06-09", paymentMethod: "transfer",
    }))
    expect(result.success).toBe(true)
    expect(execRawMock).toHaveBeenCalled() // FOR UPDATE lock taken
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 }, data: expect.objectContaining({ amount: 800 }) }),
    )
    // GL kept in sync inside the transaction: old cash journal reversed + reposted,
    // invoice recalced. The reverse now uses the tx-aware variant so a failed repost
    // rolls back the delete.
    expect(deleteJournalByRefTxMock).toHaveBeenCalledWith(expect.anything(), "SalesPayment", 9)
    expect(onPaymentCreatedMock).toHaveBeenCalled()
    expect(onPaymentUpdatedMock).toHaveBeenCalled()
  })

  it("allows editing a payment whose invoice is already fully paid", async () => {
    // Once a payment settles the invoice, onSalesPaymentUpdated flips the invoice
    // to "paid". Correcting that payment (amount/date/account) is a normal edit and
    // must not be blocked by the status guard — only never-posted/voided invoices
    // are off-limits.
    invoiceFindUniqueOrThrowMock.mockResolvedValue({
      id: 50, grandTotal: 1000, customerId: 3, status: "paid",
    })
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "800", paymentDate: "2026-06-09", paymentMethod: "transfer",
    }))
    expect(result.success).toBe(true)
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 }, data: expect.objectContaining({ amount: 800 }) }),
    )
  })

  it("still rejects an edit onto an invoice that was never posted", async () => {
    invoiceFindUniqueOrThrowMock.mockResolvedValue({
      id: 50, grandTotal: 1000, customerId: 3, status: "draft",
    })
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "100", paymentDate: "2026-06-09", paymentMethod: "cash",
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("sudah diposting")
    expect(paymentUpdateMock).not.toHaveBeenCalled()
  })
})

describe("updateSalesPayment dengan PPh dipotong pelanggan", () => {
  it("menghitung potongan pembayaran LAIN sebagai pelunasan saat memeriksa sisa tagihan", async () => {
    // Pembayaran lain: kas 200 + potongan 300 = 500 terlunasi.
    // grandTotal 1000 → sisa 500.
    paymentAggregateMock.mockResolvedValue({ _sum: { amount: 200, withholdingAmount: 300 } })

    // Kalau potongan pembayaran lain diabaikan (hanya kas 200), sisa akan
    // terbaca 800 dan edit 400 + potongan 150 ini lolos — padahal 550 > 500.
    const overpay = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "400", paymentDate: "2026-06-09", paymentMethod: "transfer",
      withholdingTypeId: "7", withholdingAmount: "150",
    }))
    expect(overpay.success).toBe(false)
    expect(overpay.error).toContain("melebihi sisa tagihan")
    expect(paymentUpdateMock).not.toHaveBeenCalled()

    // Kas 300 + potongan 200 = tepat 500 → boleh.
    const allowed = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "300", paymentDate: "2026-06-09", paymentMethod: "transfer",
      withholdingTypeId: "7", withholdingAmount: "200",
    }))
    expect(allowed.success).toBe(true)
    expect(paymentAggregateMock).toHaveBeenCalledWith(
      expect.objectContaining({ _sum: expect.objectContaining({ withholdingAmount: true }) }),
    )
  })

  it("menyimpan jenis PPh, nilai potongan, dan bukti potongnya", async () => {
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "700", paymentDate: "2026-06-09", paymentMethod: "transfer",
      withholdingTypeId: "7", withholdingAmount: "100", withholdingCertificateNo: "BP-2026-0007",
      withholdingDate: "2026-06-10",
    }))
    expect(result.success).toBe(true)
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        data: expect.objectContaining({
          amount: 700,
          withholdingTypeId: 7,
          withholdingAmount: 100,
          withholdingCertificateNo: "BP-2026-0007",
          withholdingDate: new Date("2026-06-10"),
        }),
      }),
    )
  })

  it("menolak potongan PPh tanpa jenisnya, sebelum menyentuh database", async () => {
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "700", paymentDate: "2026-06-09", paymentMethod: "transfer",
      withholdingAmount: "100",
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("Jenis PPh wajib dipilih")
    expect(execRawMock).not.toHaveBeenCalled()
    expect(paymentUpdateMock).not.toHaveBeenCalled()
  })

  it("mengosongkan potongan saat edit tidak lagi memuat PPh", async () => {
    // Operator menghapus potongannya: nilainya harus kembali 0, bukan menyisakan
    // angka lama yang membuat pelunasan piutang tetap lebih besar dari kas.
    const result = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "800", paymentDate: "2026-06-09", paymentMethod: "transfer",
    }))
    expect(result.success).toBe(true)
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          withholdingTypeId: null,
          withholdingAmount: 0,
          withholdingCertificateNo: null,
          withholdingDate: null,
        }),
      }),
    )
  })
})

/**
 * FIN-BR-008 (t_9a24236e): sesudah reversal, baris pembayaran TETAP ada dengan
 * status "reversed". Dua hal wajib benar: baris batal tidak boleh diedit, dan
 * pembayaran pengganti harus DITERIMA karena nilai batal tidak ikut dihitung
 * sebagai pelunasan.
 */
describe("updateSalesPayment sesudah reversal FIN-BR-008", () => {
  it("menolak edit baris reversed, lalu menerima pembayaran pengganti", async () => {
    paymentFindUniqueOrThrowMock.mockResolvedValueOnce({
      salesInvoiceId: 50, documentNo: "PAY-0001", status: "reversed",
    })
    const tolak = await updateSalesPayment(9, fd({
      salesInvoiceId: "50", amount: "100", paymentDate: "2026-06-09", paymentMethod: "cash",
    }))
    expect(tolak.success).toBe(false)
    expect(tolak.error).toContain("sudah dibalik")
    expect(paymentUpdateMock).not.toHaveBeenCalled()

    // Pengganti: agregat pembayaran lain kosong karena baris reversed disaring.
    paymentFindUniqueOrThrowMock.mockResolvedValueOnce({
      salesInvoiceId: 50, documentNo: "PAY-0002",
    })
    invoiceFindUniqueOrThrowMock.mockResolvedValueOnce({
      id: 50, grandTotal: 1000, customerId: 3, status: "partial",
    })
    paymentAggregateMock.mockResolvedValueOnce({ _sum: { amount: null, withholdingAmount: null } })
    const res = await updateSalesPayment(10, fd({
      salesInvoiceId: "50", amount: "1000", paymentDate: "2026-06-09", paymentMethod: "transfer",
    }))
    expect(res.success).toBe(true)
    expect(paymentAggregateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "reversed" } }),
      }),
    )
  })
})
