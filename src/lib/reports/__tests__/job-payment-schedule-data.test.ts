import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader jadwal termin (F-2026-10-22-067-S). Yang dijaga: tanpa
 * jadwal aktif -> null (regresi nol kartu existing); invoice tiga
 * jembatan dedup per id; loader TIDAK PERNAH membaca DownPayment
 * (DP bukan ukuran terpenuhi — falsifikasi: mock downPayment tidak
 * ada, panggilan apa pun ke sana membuat tes ini meledak).
 */

const mocks = vi.hoisted(() => {
  const prismaMock = {
    quotation: { findFirst: vi.fn().mockResolvedValue(null) },
    jobPaymentSchedule: { findFirst: vi.fn().mockResolvedValue(null) },
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    // Sengaja TANPA downPayment: loader jadwal dilarang membacanya.
  }
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadJobPaymentSchedule } from "../job-payment-schedule-data"

const NOW = new Date(Date.UTC(2026, 9, 22, 3, 0, 0))

function scheduleRow() {
  return {
    id: 5,
    terms: [
      {
        id: 11,
        name: "DP",
        cumulativePercent: 30,
        dueDate: new Date(Date.UTC(2026, 9, 1)),
        milestoneLabel: null,
        sortOrder: 0,
      },
      {
        id: 12,
        name: "Pelunasan",
        cumulativePercent: 100,
        dueDate: new Date(Date.UTC(2026, 11, 1)),
        milestoneLabel: "Serah terima",
        sortOrder: 1,
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.quotation.findFirst.mockResolvedValue({ id: 9, grandTotal: 100_000_000 })
  mocks.prismaMock.jobPaymentSchedule.findFirst.mockResolvedValue(scheduleRow())
  mocks.prismaMock.salesOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
})

describe("loadJobPaymentSchedule", () => {
  it("quotation tanpa jadwal aktif -> null (BR-TM67-09 regresi nol)", async () => {
    mocks.prismaMock.jobPaymentSchedule.findFirst.mockResolvedValue(null)
    await expect(loadJobPaymentSchedule(9, NOW)).resolves.toBeNull()
    expect(mocks.prismaMock.salesInvoice.findMany).not.toHaveBeenCalled()
  })

  it("quotation tidak ada -> null", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(null)
    await expect(loadJobPaymentSchedule(404, NOW)).resolves.toBeNull()
  })

  it("label jadwal persis 'Jadwal kesepakatan' dan status dari tertagih, bukan DP", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValueOnce([
      { id: 1, status: "posted", grandTotal: 30_000_000 },
    ])
    const result = await loadJobPaymentSchedule(9, NOW)
    expect(result?.scheduleLabel).toBe("Jadwal kesepakatan")
    expect(result?.terms[0].status).toBe("terpenuhi")
    expect(result?.terms[1].status).toBe("belum_jatuh_tempo")
    expect(result?.nextTermId).toBe(12)
  })

  it("invoice sama dari dua jembatan terhitung sekali", async () => {
    const shared = { id: 7, status: "posted", grandTotal: 30_000_000 }
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([{ id: 3 }])
    mocks.prismaMock.salesInvoice.findMany
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([])
    const result = await loadJobPaymentSchedule(9, NOW)
    expect(result?.billedAmount).toBe(30_000_000)
  })
})
