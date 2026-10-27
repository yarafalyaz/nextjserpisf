import { describe, it, expect, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/actions/manufacturing.actions", () => ({
  confirmProductionOrder: vi.fn(),
  issueMaterial: vi.fn(),
  completeProductionOrder: vi.fn(),
  startProductionOrder: vi.fn(),
}))

import { buildIssueMaterialArgs } from "../production-order-actions"

describe("buildIssueMaterialArgs — scrap dialog Keluarkan Bahan (F-008 UI)", () => {
  it("tanpa scrap: scrapQty 0 dan alasan/catatan null", () => {
    expect(buildIssueMaterialArgs({ itemId: 7, qty: 2 })).toEqual({
      itemId: 7,
      qty: 2,
      scrapQty: 0,
      scrapReasonCode: null,
      scrapNote: null,
    })
  })

  it("dengan scrap sah: meneruskan qty + kode alasan + catatan", () => {
    expect(
      buildIssueMaterialArgs({ itemId: 7, qty: 2, scrapQty: 0.3, scrapReasonCode: "gagal_las", scrapNote: "las retak" }),
    ).toEqual({ itemId: 7, qty: 2, scrapQty: 0.3, scrapReasonCode: "gagal_las", scrapNote: "las retak" })
  })

  it("scrap > 0 tanpa kode alasan ditolak", () => {
    expect(() => buildIssueMaterialArgs({ itemId: 7, qty: 2, scrapQty: 0.3 })).toThrow(/kode alasan/)
  })

  it("alasan lainnya tanpa catatan ditolak", () => {
    expect(() =>
      buildIssueMaterialArgs({ itemId: 7, qty: 2, scrapQty: 0.3, scrapReasonCode: "lainnya" }),
    ).toThrow(/wajib disertai catatan/)
  })

  it("scrap melebihi qty issue ditolak", () => {
    expect(() =>
      buildIssueMaterialArgs({ itemId: 7, qty: 1, scrapQty: 2, scrapReasonCode: "salah_potong" }),
    ).toThrow(/tidak boleh melebihi/)
  })
})
