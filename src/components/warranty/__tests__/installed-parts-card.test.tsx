// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

vi.mock("@/actions/warranty.actions", () => ({
  recordInstalledPartRemovalAction: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { InstalledPartsCard } from "../installed-parts-card"
import type { InstalledPartRegistryRow } from "@/lib/reports/installed-parts"

const row = (over: Partial<InstalledPartRegistryRow> = {}): InstalledPartRegistryRow => ({
  id: 3,
  itemId: 7,
  itemName: "Aki 12V 100Ah",
  itemSku: "AKI-100",
  serialNumber: "AKI-SN-0042",
  qty: 1,
  qtyRemoved: 0,
  qtyRemaining: 1,
  status: "TERPASANG",
  statusLabel: "TERPASANG",
  installedAt: new Date("2026-01-10T00:00:00Z"),
  warrantyExpiresAt: new Date("2027-01-10T00:00:00Z"),
  removedAt: null,
  removalReason: null,
  replacedByInstalledPartId: null,
  sourceCancelled: false,
  sourceWorkOrderId: 41,
  sourceProjectId: null,
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

// Penjaga UI F-072-S: kata status dari server ditampilkan verbatim
// (TERPASANG/SEBAGIAN_DILEPAS/DILEPAS); DILEPAS masuk seksi riwayat;
// serial kosong tidak pernah tampil sebagai nomor serial.
describe("InstalledPartsCard — status verbatim server, riwayat terpisah, kosong jujur", () => {
  it("part TERPASANG tampil: item, serial, WO asal, tanggal pasang, garansi berakhir", () => {
    const { container, root } = mount(<InstalledPartsCard rows={[row()]} />)
    expect(container.textContent).toContain("Part Terpasang")
    expect(container.textContent).toContain("Aki 12V 100Ah")
    expect(container.textContent).toContain("AKI-SN-0042")
    expect(container.textContent).toContain("TERPASANG")
    expect(container.textContent).toContain("10 Januari 2026")
    expect(container.textContent).toContain("10 Januari 2027")
    expect(container.querySelector('a[href="/produksi/perintah-kerja/41"]')).not.toBeNull()
    expect(container.textContent).not.toContain("Riwayat Dilepas / Diganti")
    act(() => root.unmount())
  })

  it("DILEPAS masuk riwayat; SEBAGIAN_DILEPAS tetap terpasang dengan sisa qty", () => {
    const { container, root } = mount(
      <InstalledPartsCard
        rows={[
          row(),
          row({
            id: 4, itemId: 9, itemName: "Kampas Rem", itemSku: null,
            serialNumber: "BRK-009", qty: 4, qtyRemoved: 1, qtyRemaining: 3,
            status: "SEBAGIAN_DILEPAS", statusLabel: "SEBAGIAN_DILEPAS",
          }),
          row({
            id: 5, itemId: 11, itemName: "Filter Oli", itemSku: null,
            serialNumber: null, qty: 1, qtyRemoved: 1, qtyRemaining: 0,
            status: "DILEPAS", statusLabel: "DILEPAS",
            warrantyExpiresAt: null, removedAt: new Date("2026-03-01T00:00:00Z"),
            removalReason: "Diganti baru",
          }),
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Riwayat Dilepas / Diganti")
    expect(text.indexOf("Aki 12V 100Ah")).toBeLessThan(text.indexOf("Riwayat Dilepas / Diganti"))
    expect(text.indexOf("Riwayat Dilepas / Diganti")).toBeLessThan(text.indexOf("Filter Oli"))
    expect(text).toContain("SEBAGIAN_DILEPAS")
    expect(text).toContain("3 dari 4")
    expect(text).toContain("DILEPAS")
    expect(text).toContain("1 Maret 2026")
    expect(text).toContain("Belum ada nomor serial tercatat")
    expect(text).toContain("Tanpa cakupan garansi")
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

  it("tanpa izin catat-lepas: tombol Catat Lepas tidak tampil; DILEPAS tidak dapat dicatat lagi", () => {
    const { container, root } = mount(
      <InstalledPartsCard
        canRecordRemoval
        rows={[
          row(),
          row({
            id: 5, itemId: 11, itemName: "Filter Oli", serialNumber: null,
            qty: 1, qtyRemoved: 1, qtyRemaining: 0,
            status: "DILEPAS", statusLabel: "DILEPAS", warrantyExpiresAt: null,
            removedAt: new Date("2026-03-01T00:00:00Z"), removalReason: "Diganti baru",
          }),
        ]}
      />,
    )
    expect(container.querySelector('button[aria-label="Catat lepas Aki 12V 100Ah"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Catat lepas Filter Oli"]')).toBeNull()
    act(() => root.unmount())

    const denied = mount(<InstalledPartsCard rows={[row()]} />)
    expect(denied.container.querySelector('button[aria-label="Catat lepas Aki 12V 100Ah"]')).toBeNull()
    act(() => denied.root.unmount())
  })
})
