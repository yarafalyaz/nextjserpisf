import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Aksi jadwal termin F-2026-10-22-067-S. Mock Prisma mandiri.
 * Yang dijaga (AC-TM67-1/5 + BR-TM67-06):
 * - izin kelola edit_quotations, lihat view_quotations (Q-TM67-5);
 * - satu jadwal aktif per Quotation: create kedua ditolak di tx;
 * - create/update/cancel TIDAK PERNAH menyentuh model dokumen uang
 *   (salesInvoice/downPayment/customerCredit/journalEntry dibuat =
 *   tes meledak karena mock model itu tidak disediakan);
 * - ubah baris sesudah termin terpenuhi tanpa alasan ditolak;
 *   dengan alasan tersimpan + jejak amendedBy/At tercatat.
 */

const mocks = vi.hoisted(() => {
  const txMock = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 9 }]),
    quotation: { findFirst: vi.fn() },
    jobPaymentSchedule: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    jobPaymentScheduleTerm: { deleteMany: vi.fn(), createMany: vi.fn() },
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    // Sengaja TANPA salesInvoice.create / downPayment / customerCredit /
    // journalEntry: aksi jadwal menulis dokumen uang = tes meledak.
  }
  const prismaMock = {
    ...txMock,
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txMock)),
  }
  const requirePermissionMock = vi.fn().mockResolvedValue({ id: 7 })
  return { prismaMock, txMock, requirePermissionMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
  hasPermission: vi.fn().mockResolvedValue(true),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  reportPostCommitAuditFailure: vi.fn(),
}))

import {
  createJobPaymentSchedule,
  updateJobPaymentScheduleTerms,
  cancelJobPaymentSchedule,
} from "../job-payment-schedule.actions"

const TERMS = [
  { name: "DP", cumulativePercent: 30, dueDate: "2026-10-01" },
  { name: "Pelunasan", cumulativePercent: 100, dueDate: "2026-12-01" },
]

function scheduleWithTerms(status = "aktif") {
  return {
    id: 5,
    quotationId: 9,
    status,
    terms: [
      { id: 11, name: "DP", cumulativePercent: 30, dueDate: new Date(Date.UTC(2026, 9, 1)), milestoneLabel: null, sortOrder: 0 },
      { id: 12, name: "Pelunasan", cumulativePercent: 100, dueDate: new Date(Date.UTC(2026, 11, 1)), milestoneLabel: null, sortOrder: 1 },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  mocks.txMock.$queryRaw.mockResolvedValue([{ id: 9 }])
  mocks.txMock.quotation.findFirst.mockResolvedValue({
    id: 9,
    documentNo: "Q-0009",
    status: "accepted",
    grandTotal: 100_000_000,
  })
  mocks.txMock.jobPaymentSchedule.findFirst.mockResolvedValue(null)
  mocks.txMock.jobPaymentSchedule.findUnique.mockResolvedValue(scheduleWithTerms())
  mocks.txMock.jobPaymentSchedule.create.mockResolvedValue({ id: 5 })
  mocks.txMock.jobPaymentSchedule.update.mockResolvedValue({ id: 5 })
  mocks.txMock.jobPaymentScheduleTerm.deleteMany.mockResolvedValue({ count: 2 })
  mocks.txMock.jobPaymentScheduleTerm.createMany.mockResolvedValue({ count: 2 })
  mocks.txMock.salesOrder.findMany.mockResolvedValue([])
  mocks.txMock.workOrder.findMany.mockResolvedValue([])
  mocks.txMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mocks.txMock),
  )
})

describe("createJobPaymentSchedule", () => {
  it("izin edit_quotations; membuat jadwal + baris, tanpa dokumen uang", async () => {
    const res = await createJobPaymentSchedule({ quotationId: 9, terms: TERMS })
    expect(res).toEqual({ success: true, id: 5 })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_quotations")
    const data = mocks.txMock.jobPaymentSchedule.create.mock.calls[0][0].data
    expect(data.quotationId).toBe(9)
    expect(data.terms.create).toHaveLength(2)
    expect(data.terms.create[0].cumulativePercent).toBe(30)
  })

  it("jadwal aktif kedua ditolak (penjaga satu-aktif di tx)", async () => {
    mocks.txMock.jobPaymentSchedule.findFirst.mockResolvedValue({ id: 99 })
    const res = await createJobPaymentSchedule({ quotationId: 9, terms: TERMS })
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah memiliki jadwal termin aktif")
    expect(mocks.txMock.jobPaymentSchedule.create).not.toHaveBeenCalled()
  })

  it("persen tidak naik ketat ditolak server sebelum tulis", async () => {
    const res = await createJobPaymentSchedule({
      quotationId: 9,
      terms: [
        { name: "A", cumulativePercent: 30, dueDate: "2026-10-01" },
        { name: "B", cumulativePercent: 30, dueDate: "2026-11-01" },
        { name: "C", cumulativePercent: 100, dueDate: "2026-12-01" },
      ],
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain("naik ketat")
    expect(mocks.txMock.jobPaymentSchedule.create).not.toHaveBeenCalled()
  })

  it("quotation cancelled ditolak", async () => {
    mocks.txMock.quotation.findFirst.mockResolvedValue({
      id: 9,
      documentNo: "Q-0009",
      status: "cancelled",
      grandTotal: 0,
    })
    const res = await createJobPaymentSchedule({ quotationId: 9, terms: TERMS })
    expect(res.success).toBe(false)
    expect(res.error).toContain("dibatalkan")
  })
})

describe("updateJobPaymentScheduleTerms (BR-TM67-06)", () => {
  it("sesudah termin terpenuhi, ubah tanpa alasan ditolak dan tidak menulis", async () => {
    mocks.txMock.salesInvoice.findMany.mockResolvedValue([
      { id: 1, status: "posted", grandTotal: 30_000_000 },
    ])
    const res = await updateJobPaymentScheduleTerms({ scheduleId: 5, terms: TERMS })
    expect(res.success).toBe(false)
    expect(res.error).toContain("wajib mengisi alasan")
    expect(mocks.txMock.jobPaymentScheduleTerm.deleteMany).not.toHaveBeenCalled()
  })

  it("dengan alasan: baris diganti + jejak amendemen tercatat", async () => {
    mocks.txMock.salesInvoice.findMany.mockResolvedValue([
      { id: 1, status: "posted", grandTotal: 30_000_000 },
    ])
    const res = await updateJobPaymentScheduleTerms({
      scheduleId: 5,
      terms: TERMS,
      reason: "Geser termin rangka sesuai kesepakatan ulang",
    })
    expect(res).toEqual({ success: true, id: 5 })
    expect(mocks.txMock.jobPaymentScheduleTerm.createMany).toHaveBeenCalledTimes(1)
    const updateData = mocks.txMock.jobPaymentSchedule.update.mock.calls[0][0].data
    expect(updateData.amendmentReason).toContain("kesepakatan ulang")
    expect(updateData.amendedBy).toBe(7)
    expect(updateData.amendedAt).toBeInstanceOf(Date)
  })

  it("belum ada termin terpenuhi: ubah tanpa alasan lolos (DP confirmed tidak dihitung)", async () => {
    // salesInvoice kosong = tertagih 0. Bila aksi keliru membaca DP,
    // mock ini tidak menyediakannya — aksi tidak boleh menyentuhnya.
    const res = await updateJobPaymentScheduleTerms({ scheduleId: 5, terms: TERMS })
    expect(res).toEqual({ success: true, id: 5 })
  })
})

describe("cancelJobPaymentSchedule", () => {
  it("alasan wajib; batal menandai status + pencatat", async () => {
    expect((await cancelJobPaymentSchedule({ scheduleId: 5, reason: " " })).success).toBe(false)
    const res = await cancelJobPaymentSchedule({ scheduleId: 5, reason: "Kesepakatan dibatalkan pelanggan" })
    expect(res).toEqual({ success: true, id: 5 })
    const data = mocks.txMock.jobPaymentSchedule.update.mock.calls[0][0].data
    expect(data.status).toBe("dibatalkan")
    expect(data.cancelledBy).toBe(7)
  })
})
