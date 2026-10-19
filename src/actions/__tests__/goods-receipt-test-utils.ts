import { vi } from "vitest"

// Shared GoodsReceipt action test scaffolding: Prisma + module mocks and the
// minimal GR FormData builder. Keeps the per-file mock blocks from triplicating
// across the goods-receipt regression suites (Sonar duplication gate).
export function createGoodsReceiptMocks() {
  const prismaMock: any = {
    purchaseOrder: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    goodsReceiptItem: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    goodsReceipt: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $executeRaw: vi.fn().mockResolvedValue(1),
  }
  return {
    // roles super_admin → scope gudang "all", sehingga tes fokus ke guard-nya
    // sendiri (scope diuji di purchase.actions.test.ts).
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1, roles: ["super_admin"] }),
    prismaMock,
  }
}

export function goodsReceiptForm(items: unknown[], overrides: Record<string, string> = {}) {
  const f = new FormData()
  f.append("purchaseOrderId", overrides.purchaseOrderId ?? "1")
  f.append("date", overrides.date ?? "2026-01-15")
  f.append("warehouseId", overrides.warehouseId ?? "5")
  f.append("items", JSON.stringify(items))
  return f
}

export function mockApprovedPo(mocks: ReturnType<typeof createGoodsReceiptMocks>, items: unknown[]) {
  const po = { id: 1, status: "approved", items }
  mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue(po)
  mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue(po)
}

export function mockGrCreate(mocks: ReturnType<typeof createGoodsReceiptMocks>) {
  mocks.prismaMock.goodsReceipt.create.mockResolvedValue({ id: 99, purchaseOrderId: 1, documentNo: "GR-123" })
}
