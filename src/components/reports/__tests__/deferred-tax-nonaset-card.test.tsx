// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { DeferredTaxNonAssetCard } from "../deferred-tax-nonaset-card"
import { DEFERRED_TAX_NOTICE } from "@/lib/reports/deferred-tax"
import {
  buildDeferredTaxNonAssetSources,
  NONASET_CKPN_UNAVAILABLE_LABEL,
  NONASET_FISCAL_LOSS_UNAVAILABLE_LABEL,
  NONASET_NEGATIVE_BALANCE_LABEL,
  NONASET_PROVISION_UNMAPPED_LABEL,
  NONASET_PROVISION_ZERO_VERIFIED_LABEL,
  NONASET_RECOGNITION_UNTESTED_LABEL,
  type CkpnInput,
  type FiscalLossYearInput,
  type WarrantyProvisionInput,
} from "@/lib/reports/deferred-tax-nonaset"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const AS_OF = new Date(Date.UTC(2026, 11, 31))

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
    asOf: AS_OF,
    ...overrides,
  })
}

describe("DeferredTaxNonAssetCard F-2026-10-23-126-V", () => {
  it("live hari ini: provisi nol terverifikasi + CKPN/rugi fiskal belum tersedia bernama verbatim, risiko + notice, nol tombol jurnal", () => {
    const report = build()
    const { container, root } = renderCard(<DeferredTaxNonAssetCard report={report} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Sumber Temporer Non-Aset Pajak Tangguhan"]')).not.toBeNull()
    expect(text).toContain(NONASET_PROVISION_ZERO_VERIFIED_LABEL)
    expect(text).toContain(NONASET_CKPN_UNAVAILABLE_LABEL)
    expect(text).toContain(NONASET_FISCAL_LOSS_UNAVAILABLE_LABEL)
    expect(text).toContain(NONASET_RECOGNITION_UNTESTED_LABEL)
    expect(text).toContain("tarif pasokan operator — bukan master")
    expect(text).toContain(DEFERRED_TAX_NOTICE)
    expect(text).toContain(report.verdict)
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("a")).toBeNull()
    unmountCard(root)
  })

  it("provisi terhitung + rugi fiskal risiko kedaluwarsa: angka builder apa adanya, dedup per sumber tanpa netting", () => {
    const report = build({
      provision: provision({ postedProvisionBalance: 10_000_000, postedProvisionJournalCount: 1 }),
      fiscalLossYears: [loss({ lossYear: 2022 })],
    })
    const { container, root } = renderCard(<DeferredTaxNonAssetCard report={report} />)
    const text = container.textContent ?? ""
    // Indikasi per builder: (10jt + 50jt) x 22%, tampil dari totals verbatim.
    expect(text).toContain("indikasi aset Rp 13.200.000")
    expect(text).toContain("risiko kedaluwarsa rugi fiskal — jendela tersisa ≤1 tahun")
    expect(text).toContain("rugi 2022: awal 50.000.000")
    expect(text).toContain("Provisi garansi")
    expect(text).toContain("Akumulasi rugi fiskal")
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })

  it("fail-closed bernama: akun belum terpetakan, saldo negatif, mutasi + penolakan tampil verbatim", () => {
    const report = build({
      provision: provision({ postedProvisionBalance: null }),
      ckpn: ckpn({
        postedAllowanceBalance: -5_000_000,
        writeOffs: [{ receivableLabel: "Piutang A", amount: 0, pmk105Complete: false }],
      }),
      fiscalLossYears: [loss({ signedBy: null })],
    })
    const { container, root } = renderCard(<DeferredTaxNonAssetCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain(NONASET_PROVISION_UNMAPPED_LABEL)
    expect(text).toContain(`CKPN: ${NONASET_NEGATIVE_BALANCE_LABEL}`)
    expect(text).toContain("hapus-buku jumlah tidak sah")
    expect(text).toContain("register tidak sah")
    expect(text).toContain(DEFERRED_TAX_NOTICE)
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })

  it("tarif tidak sah: verdict fail-closed builder tampil, nol baris sumber karangan", () => {
    const report = build({ taxRatePercent: null })
    const { container, root } = renderCard(<DeferredTaxNonAssetCard report={report} />)
    const text = container.textContent ?? ""
    expect(report.lines).toHaveLength(0)
    expect(text).toContain("Sumber temporer non-aset tidak dihitung: tarif badan tidak sah")
    expect(text).toContain(DEFERRED_TAX_NOTICE)
    expect(text.split(DEFERRED_TAX_NOTICE).length - 1).toBeGreaterThanOrEqual(2)
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })
})
