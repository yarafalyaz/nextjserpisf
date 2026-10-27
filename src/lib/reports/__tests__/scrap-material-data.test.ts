import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Loader scrap-material (tindak lanjut t_4c0eebfc):
 * - butir (b): installedQty produksi tetap null — rekonsiliasi BR-SCRAP-07
 *   tidak dinilai (keputusan tertulis di loader), bukan ditebak.
 * - butir (c): antrean tinjau dibaca loader, bukan page.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    materialIssueItem: { findMany: vi.fn() },
    productionOrderMaterial: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
    remnant: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadScrapMaterialReport, loadScrapReviewQueue } from "../scrap-material-data"

const start = new Date("2026-10-01")
const end = new Date("2026-10-31")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.materialIssueItem.findMany.mockResolvedValue([])
  mocks.prismaMock.productionOrderMaterial.findMany.mockResolvedValue([])
  mocks.prismaMock.journal.findMany.mockResolvedValue([])
  mocks.prismaMock.remnant.findMany.mockResolvedValue([])
  mocks.prismaMock.item.findMany.mockResolvedValue([])
})

describe("loadScrapMaterialReport — rekonsiliasi tidak dinilai (butir b)", () => {
  it("baris MI produksi: reconciliationVarianceQty null, tanpa temuan", async () => {
    mocks.prismaMock.materialIssueItem.findMany.mockResolvedValue([
      {
        id: 11, itemId: 5, qty: 10, scrapQty: 1, scrapReasonCode: "salah_potong",
        scrapPercentSnapshot: 5, scrapPlannedQtySnapshot: 10,
        scrapNormalQtySnapshot: 1, scrapAbnormalQtySnapshot: 0,
        scrapNormalValueSnapshot: 100, scrapAbnormalValueSnapshot: 0,
        scrapReviewStatus: null, scrapReviewDisposition: null,
        materialIssue: { documentNo: "MI-1", date: new Date("2026-10-10") },
      },
    ])
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 5, name: "Plat 6mm", category: { scrapAllowanceNote: "Acuan plat", materialShape: "plat" } },
    ])
    const { report } = await loadScrapMaterialReport(start, end)
    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].reconciliationVarianceQty).toBeNull()
    expect(report.lines[0].reconciliationFinding).toBe(false)
    expect(report.totals.reconciliationFindingLines).toBe(0)
    // Field butir (a) tetap terbawa loader ke builder.
    expect(report.lines[0].allowanceNote).toBe("Acuan plat")
    expect(report.lines[0].materialShape).toBe("plat")
  })
})

describe("loadScrapMaterialReport — jurnal scrap REVERSED tidak terhitung (TASK-022)", () => {
  it("query jurnal menyaring status POSTED; jurnal REVERSED tersaring dari abnormalJournalValue", async () => {
    const raw = [
      { status: "POSTED", totalDebit: 400 },
      { status: "REVERSED", totalDebit: 400 },
      { status: "DRAFT", totalDebit: 400 },
    ]
    mocks.prismaMock.journal.findMany.mockImplementation(async ({ where }: { where: { status?: string } }) =>
      raw.filter((j) => !where.status || j.status === where.status),
    )
    const { report } = await loadScrapMaterialReport(start, end)
    expect(mocks.prismaMock.journal.findMany.mock.calls[0][0].where.status).toBe("POSTED")
    expect(report.totals.abnormalJournalValue).toBe(400)
  })
})

describe("loadScrapReviewQueue (butir c)", () => {
  it("gabung MI+PO menunggu_tinjau, urut tanggal, label alasan + kategori terpetakan", async () => {
    mocks.prismaMock.materialIssueItem.findMany.mockResolvedValue([
      {
        id: 21, itemId: 5, scrapReasonCode: "salah_potong",
        scrapAbnormalQtySnapshot: 2, scrapAbnormalValueSnapshot: 300,
        materialIssue: { documentNo: "MI-9", date: new Date("2026-10-12") },
      },
    ])
    mocks.prismaMock.productionOrderMaterial.findMany.mockResolvedValue([
      {
        id: 31, itemId: 6, scrapReasonCode: "kode_tidak_dikenal",
        scrapAbnormalQtySnapshot: 1, scrapAbnormalValueSnapshot: 50,
        productionOrder: { documentNo: "PO-9", createdAt: new Date("2026-10-05") },
      },
    ])
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 5, name: "Plat 6mm", category: { scrapAllowanceNote: "Acuan plat", materialShape: "plat" } },
      { id: 6, name: "Hollow 40", category: null },
    ])
    const rows = await loadScrapReviewQueue(start, end)
    expect(rows.map((r) => r.documentNo)).toEqual(["PO-9", "MI-9"])
    expect(rows[1]).toMatchObject({
      source: "MI", lineId: 21, itemName: "Plat 6mm", abnormalQty: 2, abnormalValue: 300,
      allowanceNote: "Acuan plat", materialShape: "plat",
    })
    expect(rows[1].scrapReasonLabel).toBeTruthy()
    expect(rows[0].scrapReasonLabel).toBeNull()
    expect(rows[0].allowanceNote).toBeNull()
    expect(rows[0].materialShape).toBeNull()
  })

  it("kosong: tanpa query item lanjutan", async () => {
    const rows = await loadScrapReviewQueue(start, end)
    expect(rows).toEqual([])
    expect(mocks.prismaMock.item.findMany).not.toHaveBeenCalled()
  })
})
