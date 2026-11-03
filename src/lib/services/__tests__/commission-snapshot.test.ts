import { describe, it, expect, vi } from "vitest"

import { commissionSnapshotForPaid } from "../commission-snapshot"

describe("commissionSnapshotForPaid — putaran 80 kunci kategori", () => {
  it("mengunci baris kategori sebelum membaca tarif (penulis tarif terserialisasi)", async () => {
    const queryRaw = vi.fn(async () => [{ customerCategoryId: 3 }])
    const customerFindUnique = vi.fn().mockResolvedValue({ customerCategoryId: 3 })
    const rateFindMany = vi.fn().mockResolvedValue([
      {
        id: 4,
        customerCategoryId: 3,
        commissionPercent: 5,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null,
      },
    ])
    const db = {
      $queryRaw: queryRaw,
      customer: { findUnique: customerFindUnique },
      customerCommissionRate: { findMany: rateFindMany },
    } as never

    const result = await commissionSnapshotForPaid(
      db,
      { id: 10, customerId: 7, date: new Date("2026-06-01"), commissionRatePercent: null },
      true,
    )

    expect(result.commissionRateId).toBe(4)
    const sqls = queryRaw.mock.calls.map((c) => ((c as unknown as [string[]])[0] ?? []).join("?"))
    expect(sqls.some((s) => /customer_categories/i.test(s) && /for update/i.test(s))).toBe(true)
    const categoryLockOrder = queryRaw.mock.invocationCallOrder[sqls.findIndex((s) => /customer_categories/i.test(s))]
    expect(categoryLockOrder).toBeLessThan(rateFindMany.mock.invocationCallOrder[0])
    // Bacaan polos pertama tidak boleh mendahului kunci kategori.
    expect(categoryLockOrder).toBeLessThan(customerFindUnique.mock.invocationCallOrder[0])
  })
})
