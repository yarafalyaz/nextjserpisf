import { describe, it, expect } from "vitest"
import { resolveInventoryAccounts } from "../account-automap"

// Real-ish COA fragment (mirrors the seed's codes/names).
const COA = [
  { id: 4, code: "1200", name: "Persediaan" },
  { id: 9, code: "2000", name: "Hutang Usaha" },
  { id: 8, code: "1600", name: "Penyesuaian Persediaan" },
  { id: 17, code: "5000", name: "Harga Pokok Penjualan" },
]

describe("resolveInventoryAccounts", () => {
  it("never maps Persediaan and the clearing account to the same account", () => {
    // No dedicated GRNI/clearing account exists — the naive keyword match would
    // pick "Persediaan" for BOTH, netting the GR journal to zero.
    const { inventoryAccountId, purchaseInventoryAccountId } = resolveInventoryAccounts(COA)

    expect(inventoryAccountId).toBe("4")
    expect(purchaseInventoryAccountId).not.toBe("")
    expect(purchaseInventoryAccountId).not.toBe(inventoryAccountId)
  })

  it("prefers an explicitly-named GRNI/clearing account when one exists", () => {
    const withGrni = [
      { id: 4, code: "1200", name: "Persediaan" },
      { id: 82, code: "2150", name: "Hutang Pembelian Belum Ditagih (GRNI)" },
      { id: 9, code: "2000", name: "Hutang Usaha" },
    ]
    const { inventoryAccountId, purchaseInventoryAccountId } = resolveInventoryAccounts(withGrni)

    expect(inventoryAccountId).toBe("4")
    expect(purchaseInventoryAccountId).toBe("82")
  })

  it("matches 'clearing' by name too", () => {
    const withClearing = [
      { id: 4, code: "1200", name: "Persediaan" },
      { id: 90, code: "2190", name: "Purchase Clearing" },
    ]
    const { purchaseInventoryAccountId } = resolveInventoryAccounts(withClearing)
    expect(purchaseInventoryAccountId).toBe("90")
  })

  it("falls back to a non-inventory account (e.g. Hutang Usaha) when no clearing account exists", () => {
    const onlyInvAndPayable = [
      { id: 4, code: "1200", name: "Persediaan" },
      { id: 9, code: "2000", name: "Hutang Usaha" },
    ]
    const { inventoryAccountId, purchaseInventoryAccountId } = resolveInventoryAccounts(onlyInvAndPayable)
    expect(inventoryAccountId).toBe("4")
    expect(purchaseInventoryAccountId).toBe("9")
  })

  it("returns empty strings when no accounts exist at all", () => {
    const { inventoryAccountId, purchaseInventoryAccountId } = resolveInventoryAccounts([])
    expect(inventoryAccountId).toBe("")
    expect(purchaseInventoryAccountId).toBe("")
  })
})
