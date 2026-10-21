// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { InstalledPartsCard } from "../installed-parts-card"
import type { InstalledPartRow } from "@/lib/reports/installed-parts"

const row = (over: Partial<InstalledPartRow> = {}): InstalledPartRow => ({
  workOrderId: 41,
  itemId: 7,
  itemName: "Aki 12V 100Ah",
  itemSku: "AKI-100",
  serialNumber: "AKI-SN-0042",
  source: "coverage+material_issue",
  installedAt: new Date("2026-01-10T00:00:00Z"),
  warrantyExpiresAt: new Date("2027-01-10T00:00:00Z"),
  status: "active",
  replacedByWorkOrderId: null,
  replacementClaimId: null,
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

// Penjaga UI F-024: status pasang dari builder ditampilkan apa adanya;
// riwayat dilepas/diganti terpisah dari part terpasang; serial kosong tidak
// pernah tampil sebagai nomor serial; tanpa coverage dinyatakan eksplisit.
describe("InstalledPartsCard — part aktif, riwayat terpisah, kosong jujur", () => {
  it("part aktif tampil: item, serial, WO asal, tanggal pasang, garansi berakhir", () => {
    const { container, root } = mount(<InstalledPartsCard rows={[row()]} />)
    expect(container.textContent).toContain("Part Terpasang")
    expect(container.textContent).toContain("Aki 12V 100Ah")
    expect(container.textContent).toContain("AKI-SN-0042")
    expect(container.textContent).toContain("10 Januari 2026")
    expect(container.textContent).toContain("10 Januari 2027")
    expect(container.querySelector('a[href="/produksi/perintah-kerja/41"]')).not.toBeNull()
    expect(container.textContent).not.toContain("Riwayat Dilepas / Diganti")
    act(() => root.unmount())
  })

  it("riwayat replaced/revoked terpisah dari part terpasang, WO pengganti tertaut", () => {
    const { container, root } = mount(
      <InstalledPartsCard
        rows={[
          row(),
          row({
            itemId: 9,
            itemName: "Kampas Rem",
            itemSku: null,
            serialNumber: "BRK-009",
            status: "replaced",
            replacedByWorkOrderId: 55,
            replacementClaimId: 3,
          }),
          row({
            itemId: 11,
            itemName: "Filter Oli",
            itemSku: null,
            serialNumber: null,
            status: "revoked",
            warrantyExpiresAt: null,
          }),
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Riwayat Dilepas / Diganti")
    expect(text.indexOf("Aki 12V 100Ah")).toBeLessThan(text.indexOf("Riwayat Dilepas / Diganti"))
    expect(text.indexOf("Riwayat Dilepas / Diganti")).toBeLessThan(text.indexOf("Kampas Rem"))
    expect(text).toContain("Diganti")
    expect(text).toContain("Dicabut")
    expect(container.querySelector('a[href="/produksi/perintah-kerja/55"]')).not.toBeNull()
    // revoked tanpa serial & tanpa coverage: dua-duanya status eksplisit
    expect(text).toContain("Belum ada nomor serial tercatat")
    expect(text).toContain("Tanpa cakupan garansi")
    act(() => root.unmount())
  })

  it("expired tetap di seksi terpasang dengan chip Kedaluwarsa (garansi selesai, bukan dilepas)", () => {
    const { container, root } = mount(
      <InstalledPartsCard rows={[row({ status: "expired" })]} />,
    )
    expect(container.textContent).toContain("Kedaluwarsa")
    expect(container.textContent).not.toContain("Riwayat Dilepas / Diganti")
    act(() => root.unmount())
  })

  it("serial string kosong tidak tampil sebagai nomor serial", () => {
    const { container, root } = mount(
      <InstalledPartsCard rows={[row({ serialNumber: "" })]} />,
    )
    expect(container.textContent).toContain("Belum ada nomor serial tercatat")
    act(() => root.unmount())
  })

  it("kendaraan tanpa part: keadaan kosong jujur, tanpa seksi riwayat", () => {
    const { container, root } = mount(<InstalledPartsCard rows={[]} />)
    expect(container.textContent).toContain(
      "Belum ada part terpasang tercatat untuk kendaraan ini",
    )
    expect(container.textContent).not.toContain("Riwayat Dilepas / Diganti")
    expect(container.querySelector("article")).toBeNull()
    act(() => root.unmount())
  })
})
