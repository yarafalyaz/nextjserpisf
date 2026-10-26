// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot } from "react-dom/client"
import { act } from "react"

import {
  DownPaymentVatSnapshotCard,
  type DownPaymentVatSnapshotView,
} from "../down-payment-vat-snapshot"

const SNAP: DownPaymentVatSnapshotView = {
  vatDpp: 100_000_000,
  vatAmount: 12_000_000,
  vatTaxPeriod: "2026-10",
  pkpStatusSnapshot: "pkp",
  pkpEffectiveFromSnapshot: new Date("2026-01-01T00:00:00+07:00"),
  pkpSnapshotLabel: "pkp",
  taxInvoiceNumber: "010.000-26.00000042",
  taxStatus: "fp-um-terbit",
  taxStatusLabel: "FP uang muka terbit",
}

const LEGACY: DownPaymentVatSnapshotView = {
  ...SNAP,
  vatDpp: null,
  vatAmount: null,
  vatTaxPeriod: null,
  pkpStatusSnapshot: null,
  pkpEffectiveFromSnapshot: null,
  pkpSnapshotLabel: "legacy (snapshot PKP belum tercatat)",
  taxInvoiceNumber: null,
  taxStatus: "bukan-subjek",
  taxStatusLabel: "Bukan subjek FP uang muka",
}

function mount(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return container
}

describe("DownPaymentVatSnapshotCard (konsumen PR #785)", () => {
  it("snapshot terisi tampil verbatim server: DPP/PPN/masa/label PKP/status/FP", () => {
    const c = mount(<DownPaymentVatSnapshotCard snapshot={SNAP} />)
    expect(c.textContent).toContain("Rp 100.000.000")
    expect(c.textContent).toContain("Rp 12.000.000")
    expect(c.textContent).toContain("2026-10")
    expect(c.textContent).toContain("pkp")
    expect(c.textContent).toContain("FP uang muka terbit")
    expect(c.textContent).toContain("010.000-26.00000042")
  })

  it("snapshot null: teks status eksplisit + label legacy server, bukan angka kosong", () => {
    const c = mount(<DownPaymentVatSnapshotCard snapshot={LEGACY} />)
    expect(c.textContent).toContain("Belum ada snapshot PPN tercatat")
    expect(c.textContent).toContain("legacy (snapshot PKP belum tercatat)")
    expect(c.textContent).toContain("Bukan subjek FP uang muka")
    expect(c.textContent).not.toContain("Rp 0")
  })
})
