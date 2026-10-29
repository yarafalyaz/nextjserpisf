import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

/**
 * F-2026-10-22-084-S: snapshot estimasi biaya saat start (BR-EST-02/03a/04/07/09).
 * Tx dimock — yang dijaga turunan material + idempotensi, bukan DB asli.
 */
import { snapshotWorkOrderCostEstimateTx } from "../work-order-cost-estimate.service"

const findFirstMock = vi.fn()
const woFindMock = vi.fn()
const qFindMock = vi.fn()
const itemFindManyMock = vi.fn()
const createMock = vi.fn()

function txMock() {
  return {
    workOrderCostEstimate: { findFirst: findFirstMock, create: createMock },
    workOrder: { findUniqueOrThrow: woFindMock },
    quotation: { findUnique: qFindMock },
    item: { findMany: itemFindManyMock },
  } as never
}

const D = (n: number) => new Prisma.Decimal(n)

beforeEach(() => {
  vi.clearAllMocks()
  findFirstMock.mockResolvedValue(null)
  itemFindManyMock.mockResolvedValue([])
  createMock.mockImplementation(async ({ data }: { data: unknown }) => data)
})

function quotationMock(status: string, items: Array<{ itemId: number | null; qty: unknown }>) {
  return { id: 7, status, sections: [{ items }] }
}

describe("snapshotWorkOrderCostEstimateTx", () => {
  it("derived benar: Σ qty × standardCost; kategori lain null; total = material", async () => {
    woFindMock.mockResolvedValue({ quotationId: 7 })
    qFindMock.mockResolvedValue(
      quotationMock("accepted", [
        { itemId: 1, qty: D(2) },
        { itemId: 2, qty: D(3) },
      ]),
    )
    itemFindManyMock.mockResolvedValue([
      { id: 1, standardCost: D(100), cost: D(90) },
      { id: 2, standardCost: D(50), cost: D(40) },
    ])
    await snapshotWorkOrderCostEstimateTx(txMock(), 9, 11)
    expect(createMock).toHaveBeenCalledOnce()
    const data = createMock.mock.calls[0][0].data
    expect(Number(data.materialCost)).toBe(350)
    expect(Number(data.totalEstimate)).toBe(350)
    expect(data.laborCost).toBeNull()
    expect(data.overheadCost).toBeNull()
    expect(data.serviceCost).toBeNull()
    expect(data.subcontractCost).toBeNull()
    expect(data.otherCost).toBeNull()
    expect(data.source).toBe("derived")
    expect(data.quotationId).toBe(7)
    expect(data.lockedAt).toBeInstanceOf(Date)
  })

  it("fallback cost bila standardCost 0, tandai di notes; baris tanpa keduanya dilewati", async () => {
    woFindMock.mockResolvedValue({ quotationId: 7 })
    qFindMock.mockResolvedValue(
      quotationMock("approved", [
        { itemId: 1, qty: D(2) },
        { itemId: 2, qty: D(1) }, // standardCost=0, cost=0 → dilewati
        { itemId: null, qty: D(5) }, // baris bebas → dilewati, bukan 0
      ]),
    )
    itemFindManyMock.mockResolvedValue([
      { id: 1, standardCost: D(0), cost: D(80) },
      { id: 2, standardCost: D(0), cost: D(0) },
    ])
    await snapshotWorkOrderCostEstimateTx(txMock(), 9)
    const data = createMock.mock.calls[0][0].data
    expect(Number(data.materialCost)).toBe(160)
    expect(String(data.notes)).toMatch(/fallback/)
  })

  it("idempoten: baris sudah ada → return existing, tanpa create", async () => {
    const row = { id: 3, workOrderId: 9, materialCost: D(100) }
    findFirstMock.mockResolvedValue(row)
    const out = await snapshotWorkOrderCostEstimateTx(txMock(), 9)
    expect(out).toBe(row)
    expect(createMock).not.toHaveBeenCalled()
    expect(woFindMock).not.toHaveBeenCalled()
  })

  it("semua baris tak bisa diturunkan → material null + notes jujur, start tetap lahir", async () => {
    woFindMock.mockResolvedValue({ quotationId: 7 })
    qFindMock.mockResolvedValue(quotationMock("converted", [{ itemId: 1, qty: D(2) }]))
    itemFindManyMock.mockResolvedValue([{ id: 1, standardCost: D(0), cost: D(0) }])
    await snapshotWorkOrderCostEstimateTx(txMock(), 9)
    const data = createMock.mock.calls[0][0].data
    expect(data.materialCost).toBeNull()
    expect(data.totalEstimate).toBeNull()
    expect(String(data.notes)).toMatch(/tidak bisa diturunkan/)
    expect(createMock).toHaveBeenCalledOnce()
  })

  it("tanpa quotation / quotation belum disetujui → baris lahir, material null + notes jujur", async () => {
    woFindMock.mockResolvedValue({ quotationId: null })
    qFindMock.mockResolvedValue(null)
    await snapshotWorkOrderCostEstimateTx(txMock(), 9)
    const data = createMock.mock.calls[0][0].data
    expect(data.materialCost).toBeNull()
    expect(data.quotationId).toBeNull()
    expect(String(data.notes)).toMatch(/tanpa quotation disetujui/)
    expect(createMock).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    findFirstMock.mockResolvedValue(null)
    woFindMock.mockResolvedValue({ quotationId: 7 })
    qFindMock.mockResolvedValue(quotationMock("draft", [{ itemId: 1, qty: D(1) }]))
    await snapshotWorkOrderCostEstimateTx(txMock(), 9)
    expect(createMock.mock.calls[0][0].data.materialCost).toBeNull()
  })
})
