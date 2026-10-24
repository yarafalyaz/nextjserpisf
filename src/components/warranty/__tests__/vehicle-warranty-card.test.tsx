// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { VehicleWarrantyCard, type WarrantyCoverageCardRow } from "../vehicle-warranty-card"

const coverage = (over: Partial<WarrantyCoverageCardRow> = {}): WarrantyCoverageCardRow => ({
  id: 7,
  itemName: "Aki 12V 100Ah",
  itemSku: "AKI-100",
  status: "active",
  installedAt: new Date("2026-01-10T00:00:00Z"),
  expiresAt: new Date("2027-01-10T00:00:00Z"),
  warrantyMonths: 12,
  mileageLimitKm: 50000,
  serialNumber: null,
  termsSnapshot: "Syarat snapshot verbatim dari cakupan saat pemasangan.",
  claimCount: 2,
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

// Penjaga UI garansi: serialKey kosong TIDAK PERNAH tampil sebagai nomor
// serial; status belum-ada-serial dinyatakan eksplisit. termsSnapshot
// verbatim dari loader; kartu tidak mengklaim menilai eligibility.
describe("VehicleWarrantyCard — serialKey kosong & snapshot verbatim", () => {
  it("serial null tampil sebagai status belum ada serial, bukan bidang serial kosong", () => {
    const { container, root } = mount(
      <VehicleWarrantyCard coverages={[coverage()]} vehicleId={31} canCreateClaim={false} />,
    )
    expect(container.textContent).toContain("Belum ada nomor serial tercatat")
    expect(container.textContent).toContain("Syarat snapshot verbatim dari cakupan saat pemasangan.")
    expect(container.textContent).toContain("Klaim Tercatat")
    expect(container.querySelector(".font-mono")).toBeNull()
    act(() => root.unmount())
  })

  it("serial terisi tampil apa adanya sebagai nomor serial", () => {
    const { container, root } = mount(
      <VehicleWarrantyCard
        coverages={[coverage({ serialNumber: "AKI-SN-0042" })]}
        vehicleId={31}
        canCreateClaim={false}
      />,
    )
    expect(container.textContent).toContain("AKI-SN-0042")
    expect(container.textContent).not.toContain("Belum ada nomor serial tercatat")
    act(() => root.unmount())
  })

  it("tanpa cakupan tampil status kosong eksplisit, tanpa tombol klaim", () => {
    const { container, root } = mount(
      <VehicleWarrantyCard coverages={[]} vehicleId={31} canCreateClaim={true} />,
    )
    expect(container.textContent).toContain("Belum ada cakupan garansi tercatat")
    expect(container.querySelector('a[href*="/produksi/garansi/tambah"]')).toBeNull()
    act(() => root.unmount())
  })

  it("tombol Buat Klaim hanya bila izin create DAN ada cakupan", () => {
    const { container, root } = mount(
      <VehicleWarrantyCard coverages={[coverage()]} vehicleId={31} canCreateClaim={true} />,
    )
    expect(
      container.querySelector('a[href="/produksi/garansi/tambah?kendaraan=31"]'),
    ).not.toBeNull()
    act(() => root.unmount())
  })

  it("tautan klaim memakai slug bila tersedia", () => {
    const { container, root } = mount(
      <VehicleWarrantyCard coverages={[coverage()]} vehicleId={31} vehicleSlug="b-1234-xyz" canCreateClaim={true} />,
    )
    expect(
      container.querySelector('a[href="/produksi/garansi/tambah?kendaraan=b-1234-xyz"]'),
    ).not.toBeNull()
    act(() => root.unmount())
  })
})
