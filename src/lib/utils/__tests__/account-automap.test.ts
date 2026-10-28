import { describe, it, expect } from "vitest"
import {
  ACCOUNT_MAPPING_FIELDS,
  resolveAllAccountMappings,
  resolveAssetAccounts,
  resolveInventoryAccounts,
} from "../account-automap"

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

describe("resolveAssetAccounts", () => {
  // Seed COA fragment, ordered by code like the settings page feeds it.
  const ASSET_COA = [
    { id: 5, code: "1300", name: "Aset Tetap" },
    { id: 21, code: "2400", name: "Akumulasi Penyusutan" },
    { id: 40, code: "5300", name: "Beban Penyusutan" },
  ]

  it("maps Beban Penyusutan and Akumulasi Penyusutan to their own accounts", () => {
    const { depreciationExpenseAccountId, accumulatedDepreciationAccountId } =
      resolveAssetAccounts(ASSET_COA)

    expect(accumulatedDepreciationAccountId).toBe("21")
    expect(depreciationExpenseAccountId).toBe("40")
  })

  it("never assigns the accumulated account to the expense field", () => {
    // Regression: both names contain "penyusutan"; the bare ["penyusutan"]
    // fallback would otherwise grab "Akumulasi Penyusutan" (code 2400 < 5300)
    // and the depreciation journal would debit the contra-asset account.
    const onlyAccumulated = [{ id: 21, code: "2400", name: "Akumulasi Penyusutan" }]
    const { depreciationExpenseAccountId, accumulatedDepreciationAccountId } =
      resolveAssetAccounts(onlyAccumulated)

    expect(accumulatedDepreciationAccountId).toBe("21")
    expect(depreciationExpenseAccountId).toBe("")
  })

  it("matches the English account names", () => {
    const english = [
      { id: 50, code: "2400", name: "Accumulated Depreciation" },
      { id: 51, code: "5300", name: "Depreciation Expense" },
    ]
    const { depreciationExpenseAccountId, accumulatedDepreciationAccountId } =
      resolveAssetAccounts(english)

    expect(accumulatedDepreciationAccountId).toBe("50")
    expect(depreciationExpenseAccountId).toBe("51")
  })

  it("returns empty strings when no asset accounts exist", () => {
    const { depreciationExpenseAccountId, accumulatedDepreciationAccountId } =
      resolveAssetAccounts([])
    expect(depreciationExpenseAccountId).toBe("")
    expect(accumulatedDepreciationAccountId).toBe("")
  })
})

describe("resolveAllAccountMappings", () => {
  // A slice of the seed COA.
  const COA = [
    { id: 1, code: "1000", name: "Kas & Bank" },
    { id: 2, code: "1100", name: "Piutang Usaha" },
    { id: 14, code: "210102", name: "Uang Muka Penjualan IDR" },
    { id: 3, code: "1200", name: "Persediaan" },
    { id: 4, code: "1400", name: "PPN Masukan" },
    { id: 5, code: "2000", name: "Hutang Usaha" },
    { id: 7, code: "2200", name: "PPN Keluaran" },
    { id: 8, code: "2300", name: "Hutang Gaji" },
    { id: 9, code: "2400", name: "Akumulasi Penyusutan" },
    { id: 10, code: "4000", name: "Pendapatan Penjualan" },
    { id: 11, code: "5000", name: "Harga Pokok Penjualan" },
    { id: 12, code: "5300", name: "Beban Penyusutan" },
    { id: 13, code: "5500", name: "Kas Kecil" },
    { id: 15, code: "510104", name: "Beban Garansi" },
    { id: 16, code: "210205", name: "Provisi Garansi" },
    { id: 17, code: "110508", name: "Piutang Klaim Supplier — Garansi" },
  ]

  it("resolves the core accounting fields from the COA", () => {
    const mapping = resolveAllAccountMappings(COA)

    expect(mapping.salesReceivableAccountId).toBe("2")
    expect(mapping.salesRevenueAccountId).toBe("10")
    expect(mapping.salesTaxAccountId).toBe("7")
    expect(mapping.purchasePayableAccountId).toBe("5")
    expect(mapping.purchaseTaxAccountId).toBe("4")
    expect(mapping.cashBankAccountId).toBe("1")
    // AUD-FIN-01: kewajiban UMP — bukan Piutang (2), bukan Utang Usaha (5).
    expect(mapping.customerDownPaymentAccountId).toBe("14")
    // F-021 tahap 3: akun garansi by-code persis (510104/210205/110508).
    expect(mapping.warrantyExpenseAccountId).toBe("15")
    expect(mapping.warrantyProvisionAccountId).toBe("16")
    expect(mapping.supplierClaimReceivableAccountId).toBe("17")
    expect(mapping.pettyCashAccountId).toBe("13")
    expect(mapping.salariesPayableAccountId).toBe("8")
    expect(mapping.cogsAccountId).toBe("11")
    expect(mapping.depreciationExpenseAccountId).toBe("12")
    expect(mapping.accumulatedDepreciationAccountId).toBe("9")
  })

  it("returns a value (possibly empty) for every known account field", () => {
    const mapping = resolveAllAccountMappings(COA)
    expect(Object.keys(mapping).sort()).toEqual([...ACCOUNT_MAPPING_FIELDS].sort())
  })

  it("keeps Persediaan and the clearing account distinct", () => {
    const withGrni = [
      ...COA,
      { id: 99, code: "2150", name: "Hutang Pembelian Belum Ditagih (GRNI)" },
    ]
    const mapping = resolveAllAccountMappings(withGrni)
    expect(mapping.inventoryAccountId).toBe("3")
    expect(mapping.purchaseInventoryAccountId).toBe("99")
  })

  it("returns empty strings when there are no accounts", () => {
    const mapping = resolveAllAccountMappings([])
    expect(mapping.purchasePayableAccountId).toBe("")
    expect(mapping.cogsAccountId).toBe("")
  })
})

describe("scrapSaleIncomeAccountId automap F-135-V", () => {
  // E135-2 (automap): seed 710003 "Penjualan Persediaan / Perlengkapan"
  // resolusi pertama = saran operator/install, bukan hardcode basis jurnal.
  // Grup generik scrap/besitua sengaja tidak ada supaya akun dagang tak
  // tertarik hanya karena bernama mengandung besi tua/scrap umum.
  it("E135-2: scrapSaleIncomeAccountId automap hanya ke 710003 persis", () => {
    const coa = [
      { id: 803, code: "710003", name: "Penjualan Persediaan / Perlengkapan" },
      { id: 805, code: "710005", name: "Pendapatan Scrap Umum" },
    ]
    expect(resolveAllAccountMappings(coa).scrapSaleIncomeAccountId).toBe("803")
  })

  it("E135-2: nama generik scrap saja tidak menarik akun (kosong fail-closed)", () => {
    const coa = [{ id: 805, code: "710005", name: "Pendapatan Scrap Umum" }]
    expect(resolveAllAccountMappings(coa).scrapSaleIncomeAccountId).toBe("")
  })

})

describe("salesServiceRevenueAccountId automap F-137-V", () => {
  const SERVICE_COA = [
    { id: 410, code: "400001", name: "Penjualan" },
    { id: 411, code: "400002", name: "Pendapatan Jasa" },
  ]

  it("E137-V1: jasa -> 400002, barang -> 400001, tak klaim akun sama", () => {
    const m = resolveAllAccountMappings(SERVICE_COA)
    expect(m.salesServiceRevenueAccountId).toBe("411")
    expect(m.salesRevenueAccountId).toBe("410")
  })

  it("tanpa 400002: barang tetap 400001, jasa kosong fail-closed", () => {
    const m = resolveAllAccountMappings([
      { id: 410, code: "400001", name: "Penjualan" },
    ])
    expect(m.salesRevenueAccountId).toBe("410")
    expect(m.salesServiceRevenueAccountId).toBe("")
  })

  it("nama 'Pendapatan Jasa' tanpa kode menarik akun jasa", () => {
    const m = resolveAllAccountMappings([
      { id: 410, code: "400001", name: "Penjualan" },
      { id: 411, code: "499999", name: "Pendapatan Jasa Konsultan" },
    ])
    expect(m.salesServiceRevenueAccountId).toBe("411")
  })
})
