import { describe, expect, it } from "vitest"

import { DEFERRED_TAX_NOTICE } from "@/lib/reports/deferred-tax"
import {
  buildDeferredTaxNonAssetSources,
  fiscalLossExpiryYear,
  NONASET_CKPN_UNAVAILABLE_LABEL,
  NONASET_FISCAL_LOSS_UNAVAILABLE_LABEL,
  NONASET_PROVISION_ZERO_VERIFIED_LABEL,
  NONASET_RECOGNITION_ELIGIBLE_LABEL,
  NONASET_RECOGNITION_UNTESTED_LABEL,
  NONASET_WRITEOFF_NOT_FISCALLY_QUALIFIED_LABEL,
  type CkpnInput,
  type FiscalLossYearInput,
  type WarrantyProvisionInput,
} from "@/lib/reports/deferred-tax-nonaset"

const AS_OF_2026 = new Date(Date.UTC(2026, 11, 31))

function provision(overrides: Partial<WarrantyProvisionInput> = {}): WarrantyProvisionInput {
  return { postedProvisionBalance: 0, postedProvisionJournalCount: 0, profitBasisFrozen: false, ...overrides }
}
function ckpn(overrides: Partial<CkpnInput> = {}): CkpnInput {
  return { postedAllowanceBalance: null, writeOffs: [], profitBasisFrozen: false, ...overrides }
}
function loss(overrides: Partial<FiscalLossYearInput> = {}): FiscalLossYearInput {
  return {
    lossYear: 2026,
    initialLoss: 50_000_000,
    signedBy: "Penanggung Jawab SPT",
    compensations: [],
    profitBasisFrozen: false,
    ...overrides,
  }
}
function build(overrides: Partial<Parameters<typeof buildDeferredTaxNonAssetSources>[0]> = {}) {
  return buildDeferredTaxNonAssetSources({
    provision: provision(),
    ckpn: ckpn(),
    fiscalLossYears: [],
    taxRatePercent: 22,
    rateSource: "master",
    asOf: AS_OF_2026,
    ...overrides,
  })
}
function texts(result: ReturnType<typeof build>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice" ? row.text : row.kind === "group" ? row.label : row.kind === "total" ? `${row.label} ${row.cells.join(" | ")}` : row.cells.join(" | "),
    )
    .join("\n")
}
function line(result: ReturnType<typeof build>, source: string) {
  return result.lines.find((l) => l.source === source)!
}

describe("sumber temporer non-aset F-2026-10-23-126-V", () => {
  it("E126-1: jurnal provisi POSTED ada -> terhitung dari jurnal; nol jurnal -> nol terverifikasi (bukan flag rute)", () => {
    const counted = build({ provision: provision({ postedProvisionBalance: 10_000_000, postedProvisionJournalCount: 1 }) })
    expect(line(counted, "warranty-provision").status).toBe("computed")
    expect(line(counted, "warranty-provision").deductibleDifference).toBe(10_000_000)

    const zero = build({ provision: provision({ postedProvisionBalance: 0, postedProvisionJournalCount: 0 }) })
    expect(line(zero, "warranty-provision").status).toBe("zero-verified")
    expect(line(zero, "warranty-provision").deductibleDifference).toBe(0)
    expect(texts(zero)).toContain(NONASET_PROVISION_ZERO_VERIFIED_LABEL)
    // Kontrak tidak mengenal flag rute sama sekali.
    expect(Object.keys(provision())).not.toContain("routeActive")
    expect(Object.keys(provision())).not.toContain("provisionRouteEnabled")
  })

  it("E126-2: beban klaim rute mati bukan temporer — kontrak provisi hanya saldo POSTED, nol tanpa jurnal", () => {
    const result = build({ provision: provision({ postedProvisionBalance: 0, postedProvisionJournalCount: 0 }) })
    expect(result.totals.deductibleBySource["warranty-provision"]).toBe(0)
    expect(result.totals.deferredTaxAssetIndication).toBe(0)
  })

  it("E126-3: CKPN tanpa saldo POSTED inti F-090 = belum tersedia bernama, bukan hitungan bayangan", () => {
    const result = build()
    expect(line(result, "ckpn").status).toBe("unavailable")
    expect(line(result, "ckpn").deductibleDifference).toBe(0)
    expect(texts(result)).toContain(NONASET_CKPN_UNAVAILABLE_LABEL)
  })

  it("E126-4: hapus-buku tanpa PMK-105 lengkap tidak terealisasi fiskal; lengkap menutup sebagai mutasi", () => {
    const result = build({
      ckpn: ckpn({
        postedAllowanceBalance: 5_000_000,
        writeOffs: [
          { receivableLabel: "Piutang A", amount: 3_000_000, pmk105Complete: false },
          { receivableLabel: "Piutang B", amount: 2_000_000, pmk105Complete: true },
        ],
      }),
    })
    expect(result.totals.nonQualifiedWriteOff).toBe(3_000_000)
    expect(result.totals.realizedWriteOff).toBe(2_000_000)
    expect(texts(result)).toContain(NONASET_WRITEOFF_NOT_FISCALLY_QUALIFIED_LABEL)
    expect(texts(result)).not.toContain("dapat dibiayakan")
    expect(result.mutations.some((m) => m.includes("Piutang B"))).toBe(true)
  })

  it("E126-5: rugi fiskal hanya register bertanda tangan; register kosong/tanpa tanda tangan ditolak", () => {
    const empty = build()
    expect(line(empty, "fiscal-loss").status).toBe("unavailable")
    expect(texts(empty)).toContain(NONASET_FISCAL_LOSS_UNAVAILABLE_LABEL)

    const unsigned = build({ fiscalLossYears: [loss({ signedBy: null })] })
    expect(line(unsigned, "fiscal-loss").deductibleDifference).toBe(0)
    expect(unsigned.rejectedCompensations.length).toBe(1)
    // Kontrak builder tidak menerima laba GL/jurnal penutup.
    expect(Object.keys(loss())).not.toContain("glProfit")
    expect(Object.keys(loss())).not.toContain("closingJournalAmount")
  })

  it("E126-6: jendela 5 tahun — sisa tahun ke-6 kedaluwarsa keluar stok; kompensasi melompati tertua ditolak", () => {
    expect(fiscalLossExpiryYear(2026)).toBe(2031)
    const expired = build({
      fiscalLossYears: [loss()],
      asOf: new Date(Date.UTC(2032, 11, 31)),
    })
    expect(line(expired, "fiscal-loss").deductibleDifference).toBe(0)
    expect(expired.totals.expiredFiscalLoss).toBe(50_000_000)
    expect(expired.mutations.some((m) => m.includes("kedaluwarsa"))).toBe(true)

    const skipOldest = build({
      fiscalLossYears: [
        loss({ lossYear: 2024, initialLoss: 10_000_000 }),
        loss({ lossYear: 2025, initialLoss: 10_000_000, compensations: [{ year: 2026, amount: 5_000_000 }] }),
      ],
    })
    expect(skipOldest.rejectedCompensations.some((r) => r.includes("tertua"))).toBe(true)
    expect(line(skipOldest, "fiscal-loss").deductibleDifference).toBe(20_000_000)

    const inOrder = build({
      fiscalLossYears: [
        loss({ lossYear: 2024, initialLoss: 10_000_000, compensations: [{ year: 2025, amount: 10_000_000 }] }),
        loss({ lossYear: 2025, initialLoss: 10_000_000, compensations: [{ year: 2026, amount: 5_000_000 }] }),
      ],
    })
    expect(inOrder.rejectedCompensations).toHaveLength(0)
    expect(line(inOrder, "fiscal-loss").deductibleDifference).toBe(5_000_000)
  })

  it("E126-7: nol-netting antar sumber + label pengakuan per sumber dari dasar laba sumber itu sendiri", () => {
    const result = build({
      provision: provision({ postedProvisionBalance: 10_000_000, postedProvisionJournalCount: 1, profitBasisFrozen: true }),
      ckpn: ckpn({ postedAllowanceBalance: 5_000_000, profitBasisFrozen: false }),
    })
    expect(result.totals.deductibleBySource).toEqual({ "warranty-provision": 10_000_000, ckpn: 5_000_000, "fiscal-loss": 0 })
    // Total indikasi agregat = jumlah persis indikasi per sumber (tanpa timpa/salinghapus):
    // provisi 10jt @22% = 2.200.000 + CKPN 5jt @22% = 1.100.000.
    expect(line(result, "warranty-provision").deferredTaxAssetIndication).toBe(2_200_000)
    expect(line(result, "ckpn").deferredTaxAssetIndication).toBe(1_100_000)
    expect(result.totals.deferredTaxAssetIndication).toBe(3_300_000)
    expect(line(result, "warranty-provision").recognitionLabel).toBe(NONASET_RECOGNITION_ELIGIBLE_LABEL)
    // Sumber kedua tanpa dasar laba sendiri tetap belum-teruji walau sumber pertama eligible.
    expect(line(result, "ckpn").recognitionLabel).toBe(NONASET_RECOGNITION_UNTESTED_LABEL)
  })

  it("E126-7b: total indikasi agregat tiga sumber computed = jumlah persis per sumber", () => {
    const result = build({
      provision: provision({ postedProvisionBalance: 10_000_000, postedProvisionJournalCount: 1 }),
      ckpn: ckpn({ postedAllowanceBalance: 5_000_000 }),
      fiscalLossYears: [loss()],
    })
    // 2.200.000 (provisi) + 1.100.000 (CKPN) + 11.000.000 (rugi fiskal 50jt) @22%.
    expect(line(result, "fiscal-loss").deferredTaxAssetIndication).toBe(11_000_000)
    expect(result.totals.deferredTaxAssetIndication).toBe(14_300_000)
  })

  it("E126-8: jurnal tetap tertutup — notice verbatim, hasil read-model bukan jurnal", () => {
    const result = build({ provision: provision({ postedProvisionBalance: 10_000_000, postedProvisionJournalCount: 1 }) })
    expect(result.notice).toBe(DEFERRED_TAX_NOTICE)
    expect(texts(result)).toContain(DEFERRED_TAX_NOTICE)
    expect(result.verdict).toContain("bukan jurnal")
  })

  it("E126-9: input terbekukan sama -> hasil byte-sama (builder murni, tanpa master berjalan)", () => {
    const args = {
      provision: provision({ postedProvisionBalance: 10_000_000, postedProvisionJournalCount: 2, profitBasisFrozen: true }),
      fiscalLossYears: [loss({ compensations: [{ year: 2027, amount: 1 }] })],
    }
    const a = build(args)
    const b = build(args)
    expect(JSON.stringify(a.table.rows)).toBe(JSON.stringify(b.table.rows))
    expect(a.totals).toEqual(b.totals)
  })

  it("E126-10: contoh angka vonis — provisi 10jt -> temporer 10jt, indikasi 2,2jt @22% master; rugi 2026 sisa 50jt di neraca 2032 stok nol", () => {
    const prov = build({
      provision: provision({ postedProvisionBalance: 10_000_000, postedProvisionJournalCount: 1, profitBasisFrozen: true }),
    })
    expect(line(prov, "warranty-provision").taxBase).toBe(0)
    expect(line(prov, "warranty-provision").deductibleDifference).toBe(10_000_000)
    expect(line(prov, "warranty-provision").deferredTaxAssetIndication).toBe(2_200_000)
    expect(line(prov, "warranty-provision").recognitionLabel).toBe(NONASET_RECOGNITION_ELIGIBLE_LABEL)
    expect(prov.rateSource).toBe("master")
    expect(prov.rateSourceLabel).toBeNull()

    const lossExpired = build({ fiscalLossYears: [loss()], asOf: new Date(Date.UTC(2032, 11, 31)) })
    expect(line(lossExpired, "fiscal-loss").deductibleDifference).toBe(0)
    expect(lossExpired.totals.expiredFiscalLoss).toBe(50_000_000)

    // Risiko kedaluwarsa tampil pada baris (sisa jendela ≤1 tahun).
    const risky = build({ fiscalLossYears: [loss({ lossYear: 2022 })], asOf: new Date(Date.UTC(2026, 11, 31)) })
    expect(line(risky, "fiscal-loss").expiryRiskLabel).toContain("risiko kedaluwarsa")
  })

  it("E126-11 F1: saldo provisi/CKPN negatif + write-off negatif/NaN gagal-tertutup bernama, tanpa angka negatif", () => {
    const negProv = build({ provision: provision({ postedProvisionBalance: -5_000_000, postedProvisionJournalCount: 3 }) })
    expect(line(negProv, "warranty-provision").deductibleDifference).toBe(0)
    expect(line(negProv, "warranty-provision").deferredTaxAssetIndication).toBe(0)
    expect(line(negProv, "warranty-provision").status).not.toBe("computed")
    expect(texts(negProv)).toContain("tidak sah")

    const negCkpn = build({
      ckpn: ckpn({
        postedAllowanceBalance: -2_000_000,
        writeOffs: [
          { receivableLabel: "Piutang Neg", amount: -1_000_000, pmk105Complete: true },
          { receivableLabel: "Piutang NaN", amount: Number.NaN, pmk105Complete: true },
        ],
      }),
    })
    expect(line(negCkpn, "ckpn").deductibleDifference).toBe(0)
    expect(line(negCkpn, "ckpn").deferredTaxAssetIndication).toBe(0)
    expect(negCkpn.totals.realizedWriteOff).toBe(0)
    expect(negCkpn.totals.nonQualifiedWriteOff).toBe(0)
    expect(negCkpn.mutations.every((m) => !m.includes("terealisasi fiskal"))).toBe(true)
    expect(texts(negCkpn)).toContain("tidak sah")
  })

  it("E126-12 F2: tahun rugi duplikat ditolak bernama — tanpa tertimpa Map / sisa ganda", () => {
    const dup = build({
      fiscalLossYears: [
        loss({ lossYear: 2024, initialLoss: 10_000_000, compensations: [{ year: 2025, amount: 4_000_000 }] }),
        loss({ lossYear: 2024, initialLoss: 5_000_000 }),
      ],
    })
    // Kedua entri 2024 ditolak; tidak ada stok maupun carrying dari tahun itu.
    expect(line(dup, "fiscal-loss").deductibleDifference).toBe(0)
    expect(line(dup, "fiscal-loss").carryingAmount).toBe(0)
    expect(dup.totals.expiredFiscalLoss).toBe(0)
    expect(
      dup.rejectedCompensations.filter((r) => r.includes("2024") && r.includes("duplikat")).length,
    ).toBeGreaterThanOrEqual(1)
  })

  it("tarif tidak sah fail-closed; tarif operator berlabel", () => {
    const bad = build({ taxRatePercent: null })
    expect(bad.taxRatePercent).toBeNull()
    expect(bad.totals.deferredTaxAssetIndication).toBe(0)
    const op = build({ rateSource: "operator" })
    expect(op.rateSourceLabel).toBe("tarif pasokan operator — bukan master")
  })
})
