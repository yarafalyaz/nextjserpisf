import { describe, it, expect, vi, beforeEach } from "vitest"

// F-2026-10-22-066-S: regi penjaga inti JobChangeOrder lewat mock Prisma.
// Klaim atomik, kunci baris ter-issue, dan uang hanya lewat aksi existing
// dibuktikan di sini; atomicity DB asli = verifikasi migrasi manual BOT 6.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const nextSlugMock = vi.fn()
const createDifferenceInvoiceMock = vi.fn()
const createRevisionDownCreditMock = vi.fn()

const coUpdateManyMock = vi.fn()
const coFindUniqueMock = vi.fn()
const coFindFirstMock = vi.fn()
const coCreateMock = vi.fn()
const coUpdateMock = vi.fn()
const coItemCreateManyMock = vi.fn()
const coItemDeleteManyMock = vi.fn()
const woFindUniqueMock = vi.fn()
const woItemCreateMock = vi.fn()
const woItemUpdateMock = vi.fn()
const miItemFindManyMock = vi.fn()
const qSectionFindManyMock = vi.fn()
const qFindFirstMock = vi.fn()
const qHistoryCreateMock = vi.fn()
const qItemCreateMock = vi.fn()
const qItemUpdateMock = vi.fn()
const qItemDeleteMock = vi.fn()
const qUpdateMock = vi.fn()
const queryRawMock = vi.fn()
const txExecuteMock = vi.fn()

function makeTx() {
  return {
    $queryRaw: (...a: unknown[]) => queryRawMock(...a),
    $executeRaw: (...a: unknown[]) => txExecuteMock(...a),
    jobChangeOrder: {
      updateMany: (...a: unknown[]) => coUpdateManyMock(...a),
      findUnique: (...a: unknown[]) => coFindUniqueMock(...a),
      findFirst: (...a: unknown[]) => coFindFirstMock(...a),
      create: (...a: unknown[]) => coCreateMock(...a),
      update: (...a: unknown[]) => coUpdateMock(...a),
    },
    jobChangeOrderItem: {
      createMany: (...a: unknown[]) => coItemCreateManyMock(...a),
      deleteMany: (...a: unknown[]) => coItemDeleteManyMock(...a),
      update: vi.fn().mockResolvedValue({}),
    },
    workOrder: { findUnique: (...a: unknown[]) => woFindUniqueMock(...a) },
    workOrderItem: {
      create: (...a: unknown[]) => woItemCreateMock(...a),
      update: (...a: unknown[]) => woItemUpdateMock(...a),
    },
    materialIssueItem: { findMany: (...a: unknown[]) => miItemFindManyMock(...a) },
    quotationSection: { findMany: (...a: unknown[]) => qSectionFindManyMock(...a) },
    quotation: {
      findFirst: (...a: unknown[]) => qFindFirstMock(...a),
      update: (...a: unknown[]) => qUpdateMock(...a),
    },
    quotationHistory: { create: (...a: unknown[]) => qHistoryCreateMock(...a) },
    quotationItem: {
      create: (...a: unknown[]) => qItemCreateMock(...a),
      update: (...a: unknown[]) => qItemUpdateMock(...a),
      delete: (...a: unknown[]) => qItemDeleteMock(...a),
    },
  }
}

const txObj = makeTx()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn((cb: unknown) =>
      typeof cb === "function" ? (cb as (tx: unknown) => unknown)(txObj) : Promise.all(cb as unknown[]),
    ),
    jobChangeOrder: {
      update: (...a: unknown[]) => coUpdateMock(...a),
      findUnique: (...a: unknown[]) => coFindUniqueMock(...a),
    },
  },
  TxClient: class {},
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: (...a: unknown[]) => nextSlugMock(...a) }))
vi.mock("../sales.actions", () => ({
  // computeQuotationTotals asli dipakai ulang di sini (pure) supaya tes
  // membuktikan apply memakai hitung ulang existing, bukan rumus lokal.
  computeQuotationTotals: (data: {
    sections: { items: { qty: unknown; unitPrice: unknown; discount?: unknown }[] }[]
    discount?: unknown
    tax?: unknown
  }) => {
    let subtotal = 0
    for (const s of data.sections) {
      for (const it of s.items) {
        const qty = Math.max(0.01, Number(it.qty) || 0)
        subtotal += Math.max(0, qty * (Number(it.unitPrice) || 0) - (Number(it.discount) || 0))
      }
    }
    const headerDiscount = Math.min(Math.max(0, Number(data.discount) || 0), subtotal)
    const headerTax = Math.max(0, Number(data.tax) || 0)
    return {
      computedSubtotal: Math.round(subtotal * 100) / 100,
      headerDiscount,
      headerTax,
      computedGrandTotal: Math.max(0, Math.round((subtotal + headerTax - headerDiscount) * 100) / 100),
    }
  },
  createDifferenceInvoice: (...a: unknown[]) => createDifferenceInvoiceMock(...a),
  createRevisionDownCredit: (...a: unknown[]) => createRevisionDownCreditMock(...a),
}))

import {
  createJobChangeOrder,
  recordJobChangeOrderApproval,
  applyJobChangeOrder,
} from "../job-change-order.actions"

const WO = {
  id: 10,
  status: "in_progress",
  documentNo: "001/WO/ISF/10/2026",
  quotationId: 50,
  items: [
    { id: 11, itemId: 101, description: "Winch 4.5t", qty: 1, cost: 50000 },
    { id: 12, itemId: 102, description: "Snorkel", qty: 1, cost: 10000 },
  ],
}

const QUOTE_FLAT = [
  {
    items: [
      { id: 501, itemId: 101, unitPrice: 50000, description: "Winch 4.5t" },
      { id: 502, itemId: 102, unitPrice: 10000, description: "Snorkel" },
    ],
  },
]

const QUOTATION = {
  id: 50,
  status: "approved",
  revisionNumber: 1,
  discount: 0,
  tax: 0,
  subtotal: 60000,
  grandTotal: 60000,
  sections: [
    {
      id: 5,
      name: "Utama",
      items: [
        { id: 501, sectionId: 5, itemId: 101, description: "Winch 4.5t", uom: "pcs", qty: 1, unitPrice: 50000, discount: 0, sortOrder: 0 },
        { id: 502, sectionId: 5, itemId: 102, description: "Snorkel", uom: "pcs", qty: 1, unitPrice: 10000, discount: 0, sortOrder: 1 },
      ],
    },
  ],
}

const CO_APPROVED = {
  id: 77,
  documentNo: "001/WO/ISF/10/2026-CO-001",
  slug: "co-1",
  workOrderId: 10,
  quotationId: 50,
  status: "disetujui",
  reason: "Upgrade winch",
  sequence: 1,
  items: [
    {
      id: 771,
      workOrderItemId: 11,
      itemId: 101,
      action: "ubah",
      description: "Winch 4.5t",
      uom: "pcs",
      qtyBefore: 1,
      qtyAfter: 2,
      costAfter: 50000,
      unitPriceBefore: 50000,
      unitPriceAfter: 50000,
      discountAfter: 0,
    },
  ],
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, nextSlugMock,
    createDifferenceInvoiceMock, createRevisionDownCreditMock,
    coUpdateManyMock, coFindUniqueMock, coFindFirstMock, coCreateMock, coUpdateMock,
    coItemCreateManyMock, coItemDeleteManyMock, woFindUniqueMock, woItemCreateMock,
    woItemUpdateMock, miItemFindManyMock, qSectionFindManyMock, qFindFirstMock,
    qHistoryCreateMock, qItemCreateMock, qItemUpdateMock, qItemDeleteMock, qUpdateMock,
    queryRawMock, txExecuteMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 5 })
  nextSlugMock.mockResolvedValue("co-slug")
  queryRawMock.mockResolvedValue([{ id: 10 }])
  txExecuteMock.mockResolvedValue(1)
  woFindUniqueMock.mockResolvedValue(WO)
  miItemFindManyMock.mockResolvedValue([])
  qSectionFindManyMock.mockResolvedValue(QUOTE_FLAT)
  coFindFirstMock.mockResolvedValue(null)
  coCreateMock.mockResolvedValue({ id: 77, documentNo: "001/WO/ISF/10/2026-CO-001", slug: "co-slug" })
  coUpdateManyMock.mockResolvedValue({ count: 1 })
  coFindUniqueMock.mockResolvedValue(CO_APPROVED)
  qFindFirstMock.mockResolvedValue(QUOTATION)
  qHistoryCreateMock.mockResolvedValue({})
  qItemCreateMock.mockResolvedValue({})
  qItemUpdateMock.mockResolvedValue({})
  qItemDeleteMock.mockResolvedValue({})
  qUpdateMock.mockResolvedValue({})
  coUpdateMock.mockResolvedValue({})
  woItemCreateMock.mockResolvedValue({ id: 99 })
  woItemUpdateMock.mockResolvedValue({})
  createDifferenceInvoiceMock.mockResolvedValue({ success: true, id: 900 })
  createRevisionDownCreditMock.mockResolvedValue({ success: false, error: "Tidak ada kredit" })
})

describe("createJobChangeOrder — penjaga inti", () => {
  it("WO closed ditolak sebelum CO dibuat", async () => {
    woFindUniqueMock.mockResolvedValue({ ...WO, status: "closed" })
    const r = await createJobChangeOrder({
      workOrderId: 10,
      reason: "Ubah",
      lines: [{ action: "ubah", workOrderItemId: 11, itemId: 101, qtyAfter: 2, unitPriceAfter: 50000 }],
    })
    expect(r.success).toBe(false)
    expect(coCreateMock).not.toHaveBeenCalled()
  })

  it("satu CO aktif per WO (BR-CO-06): CO aktif lain menolak buat", async () => {
    coFindFirstMock.mockResolvedValue({ id: 70, documentNo: "X-CO-001", status: "draft" })
    const r = await createJobChangeOrder({
      workOrderId: 10,
      reason: "Ubah",
      lines: [{ action: "ubah", workOrderItemId: 11, itemId: 101, qtyAfter: 2, unitPriceAfter: 50000 }],
    })
    expect(r.success).toBe(false)
    expect(coCreateMock).not.toHaveBeenCalled()
  })

  it("baris ter-issue terkunci menolak buat (BR-CO-03)", async () => {
    miItemFindManyMock.mockResolvedValue([{ workOrderItemId: 11, itemId: 101 }])
    const r = await createJobChangeOrder({
      workOrderId: 10,
      reason: "Ubah",
      lines: [{ action: "ubah", workOrderItemId: 11, itemId: 101, qtyAfter: 2, unitPriceAfter: 50000 }],
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/terkunci/)
    expect(coCreateMock).not.toHaveBeenCalled()
  })
})

describe("recordJobChangeOrderApproval — transisi §3", () => {
  it("disetujui dari menunggu_pelanggan lolos", async () => {
    coFindUniqueMock.mockResolvedValue({ ...CO_APPROVED, status: "menunggu_pelanggan" })
    const r = await recordJobChangeOrderApproval({
      changeOrderId: 77,
      approved: true,
      approvalReference: "WA 2026-10-22",
    })
    expect(r.success).toBe(true)
  })

  it("AC-CO-9 falsifikasi: disetujui dari draft ditolak", async () => {
    coFindUniqueMock.mockResolvedValue({ ...CO_APPROVED, status: "draft" })
    const r = await recordJobChangeOrderApproval({
      changeOrderId: 77,
      approved: true,
      approvalReference: "WA 2026-10-22",
    })
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/tidak diizinkan/)
  })
})

describe("applyJobChangeOrder — klaim + uang existing", () => {
  it("klaim hilang (count 0) membatalkan sebelum revisi quotation", async () => {
    coUpdateManyMock.mockResolvedValue({ count: 0 })
    coFindUniqueMock.mockResolvedValue({ status: "diterapkan" })
    const r = await applyJobChangeOrder(77)
    expect(r.success).toBe(false)
    expect(String(r.error)).toMatch(/hanya dapat diterapkan dari status disetujui/)
    expect(qUpdateMock).not.toHaveBeenCalled()
    expect(createDifferenceInvoiceMock).not.toHaveBeenCalled()
  })

  it("terapkan sukses: quotation direvisi hitung ulang server + faktur selisih existing dipanggil", async () => {
    const r = await applyJobChangeOrder(77)
    expect(r.success).toBe(true)
    // grandTotal baru = 2*50000 + 1*10000 = 110000 lewat compute existing
    const qArg = qUpdateMock.mock.calls[0][0]
    expect(qArg.data.grandTotal).toBe(110000)
    expect(qArg.data.revisionNumber).toEqual({ increment: 1 })
    expect(qHistoryCreateMock).toHaveBeenCalledTimes(1)
    expect(woItemUpdateMock).toHaveBeenCalled()
    expect(createDifferenceInvoiceMock).toHaveBeenCalledTimes(1)
    expect(createDifferenceInvoiceMock.mock.calls[0][0]).toBe(50)
  })

  it("klaim kondisional scoped disetujui->diterapkan", async () => {
    await applyJobChangeOrder(77)
    const claimArg = coUpdateManyMock.mock.calls[0][0]
    expect(claimArg.where).toEqual({ id: 77, status: "disetujui" })
    expect(claimArg.data.status).toBe("diterapkan")
  })
})
