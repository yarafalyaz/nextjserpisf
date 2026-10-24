// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { WarrantyClaimList, type WarrantyClaimListRow } from "../warranty-claim-list"

const row: WarrantyClaimListRow = {
  id: 42,
  reportedAt: new Date("2026-10-02T00:00:00+07:00"),
  complaint: "Aki drop tidak bisa starter pagi hari",
  odometerKm: 42000,
  status: "intake",
  customerVehicle: { plateNumber: "B 1234 CD" },
  coverage: { status: "active", expiresAt: new Date("2027-01-10"), item: { name: "Aki GS Astra" } },
}

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ""
})

function mount(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container
}

describe("WarrantyClaimList mobile", () => {
  it("tabel desktop tersembunyi di mobile, kartu tampil md:hidden", () => {
    const c = mount(<WarrantyClaimList claims={[row]} />)
    const tableWrap = c.querySelector("table")?.parentElement
    expect(tableWrap?.className).toContain("hidden")
    expect(tableWrap?.className).toContain("md:block")
    const cards = c.querySelector("ul")
    expect(cards?.className).toContain("md:hidden")
    expect(cards?.getAttribute("aria-label")).toBe("Daftar klaim garansi")
  })

  it("kartu memuat plat, barang, keluhan, odometer tanpa tabel", () => {
    const c = mount(<WarrantyClaimList claims={[row]} />)
    const card = c.querySelector("ul li")
    expect(card?.textContent).toContain("B 1234 CD")
    expect(card?.textContent).toContain("Aki GS Astra")
    expect(card?.textContent).toContain("Aki drop tidak bisa starter")
    expect(card?.textContent).toContain("42.000 km")
  })

  it("tautan Detail target sentuh 44px di kartu dan tabel", () => {
    const c = mount(<WarrantyClaimList claims={[row]} />)
    const links = c.querySelectorAll('a[href="/produksi/garansi/42"]')
    expect(links.length).toBe(2)
    for (const a of links) {
      expect(a.className).toContain("min-h-11")
      expect(a.getAttribute("aria-label")).toBe("Lihat detail klaim garansi 42")
    }
  })

  it("kosong tampil pesan, bukan kartu/tabel", () => {
    const c = mount(<WarrantyClaimList claims={[]} />)
    expect(c.textContent).toContain("Belum ada klaim garansi")
    expect(c.querySelector("ul")).toBeNull()
    expect(c.querySelector("table")).toBeNull()
  })
})
