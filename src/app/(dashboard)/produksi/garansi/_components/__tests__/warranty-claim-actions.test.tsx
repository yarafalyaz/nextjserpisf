// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))
vi.mock("@/actions/warranty.actions", () => ({
  decideWarrantyClaimAction: vi.fn(async () => ({ success: true })),
  transitionWarrantyClaimAction: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

import { WarrantyClaimActions, type WarrantyClaimFacts } from "../warranty-claim-actions"

const claim = (over: Partial<WarrantyClaimFacts> = {}): WarrantyClaimFacts => ({
  id: 5,
  status: "eligibility",
  complaint: "Aki drop tidak bisa starter",
  reportedAt: "02/02/2026",
  odometerKm: 42000,
  coverageId: 7,
  coverageStatus: "active",
  coverageTermsSnapshot: "Syarat snapshot verbatim saat pemasangan.",
  serialLabel: "",
  serialIsPlaceholder: true,
  installedAt: "10/01/2026",
  expiresAt: "10/01/2027",
  warrantyMonths: 12,
  mileageLimitKm: 50000,
  plateNumber: "B 1234 CD",
  eligibility: {
    coverageStatus: "active",
    withinPeriod: true,
    withinMileage: true,
    serialMatches: null,
    notes: ["Odometer tidak tercatat/terbaca — putuskan manual berdasarkan bukti lain."],
  },
  decisionByName: null,
  decisionAt: null,
  decisionNotes: null,
  resolutionType: null,
  repairWorkOrderId: null,
  ...over,
})

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

// Guard acceptance Lead: eligibility = FAKTA penilai, bukan keputusan
// otomatis. UI wajib menyatakan bukan-otomatis + catatan fakta verbatim,
// serialKey kosong dinyatakan eksplisit, dan gating decide/transition
// terpisah persis izin approve vs edit.
describe("WarrantyClaimActions — fakta bukan keputusan, gating terpisah", () => {
  it("fakta penilaian diberi label bukan keputusan otomatis; catatan verbatim", () => {
    const { container, root } = mount(
      <WarrantyClaimActions claim={claim()} canDecide={false} canTransition={false} />,
    )
    expect(container.textContent).toContain("bukan keputusan otomatis")
    expect(container.textContent).toContain(
      "Odometer tidak tercatat/terbaca — putuskan manual berdasarkan bukti lain.",
    )
    expect(container.textContent).toContain("Syarat snapshot verbatim saat pemasangan.")
    act(() => root.unmount())
  })

  it("serialKey kosong dinyatakan eksplisit, tidak dirender sebagai nomor serial", () => {
    const { container, root } = mount(
      <WarrantyClaimActions claim={claim()} canDecide={false} canTransition={false} />,
    )
    expect(container.textContent).toContain("Belum ada nomor serial tercatat untuk cakupan ini")
    act(() => root.unmount())
  })

  it("tanpa izin approve form keputusan tidak tampil; tanpa izin edit aksi status tidak tampil", () => {
    const { container, root } = mount(
      <WarrantyClaimActions claim={claim()} canDecide={false} canTransition={false} />,
    )
    expect(container.querySelector("[aria-label='Formulir keputusan klaim garansi']")).toBeNull()
    expect(container.querySelector("[aria-label='Aksi status klaim garansi']")).toBeNull()
    act(() => root.unmount())
  })

  it("izin approve saja: form keputusan tampil, aksi transisi tidak", () => {
    const { container, root } = mount(
      <WarrantyClaimActions claim={claim()} canDecide={true} canTransition={false} />,
    )
    expect(container.querySelector("[aria-label='Formulir keputusan klaim garansi']")).not.toBeNull()
    expect(container.textContent).toContain("Simpan Keputusan")
    expect(container.querySelector("[aria-label='Aksi status klaim garansi']")).toBeNull()
    act(() => root.unmount())
  })

  it("status intake + izin edit saja: hanya aksi Mulai Penilaian Fakta", () => {
    const { container, root } = mount(
      <WarrantyClaimActions
        claim={claim({ status: "intake" })}
        canDecide={false}
        canTransition={true}
      />,
    )
    expect(container.querySelector("[aria-label='Aksi status klaim garansi']")).not.toBeNull()
    expect(container.textContent).toContain("Mulai Penilaian Fakta")
    expect(container.querySelector("[aria-label='Formulir keputusan klaim garansi']")).toBeNull()
    act(() => root.unmount())
  })

  it("status approved + izin edit: aksi perbaiki/tutup + keputusan tidak lagi tampil", () => {
    const { container, root } = mount(
      <WarrantyClaimActions
        claim={claim({
          status: "approved",
          decisionAt: "05/02/2026",
          decisionNotes: "Disetujui pejabat",
          resolutionType: "repair",
        })}
        canDecide={true}
        canTransition={true}
      />,
    )
    expect(container.querySelector("[aria-label='Formulir keputusan klaim garansi']")).toBeNull()
    expect(container.textContent).toContain("Mulai Perbaikan")
    expect(container.textContent).toContain("Tutup Klaim")
    expect(container.textContent).toContain("Disetujui pejabat")
    act(() => root.unmount())
  })
})
