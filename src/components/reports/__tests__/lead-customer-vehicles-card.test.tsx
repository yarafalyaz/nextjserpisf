// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import {
  LeadCustomerVehiclesCard,
  type LeadCustomerVehicleRow,
} from "../lead-customer-vehicles-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

function row(over: Partial<LeadCustomerVehicleRow>): LeadCustomerVehicleRow {
  return {
    id: 7,
    slug: "b-1234-aa",
    plateNumber: "B 1234 AA",
    vehicleName: "Mitsubishi Pajero",
    color: "Hitam",
    year: 2022,
    isActive: true,
    ...over,
  }
}

afterEach(() => {
  clearRenderedCards()
})

describe("LeadCustomerVehiclesCard F-2026-10-20-93(a)", () => {
  it("tautan tiap kendaraan ke detail kendaraan pelanggan itu", () => {
    const { container, root } = renderCard(
      <LeadCustomerVehiclesCard
        customerSlug="budi-santoso"
        customerId={3}
        customerName="Budi Santoso"
        vehicles={[
          row({ id: 7, slug: "b-1234-aa", vehicleName: "Mitsubishi Pajero" }),
          row({ id: 8, slug: null, plateNumber: "B 9 XY", vehicleName: null, isActive: false }),
        ]}
      />,
    )
    expect(container.querySelector('[aria-label="Kendaraan Pelanggan"]')).not.toBeNull()
    expect(container.textContent).toContain("2 kendaraan · Budi Santoso")
    const links = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    )
    expect(links).toEqual([
      "/master/pelanggan/budi-santoso/kendaraan/b-1234-aa",
      "/master/pelanggan/budi-santoso/kendaraan/8",
    ])
    expect(container.textContent).toContain("Mitsubishi Pajero")
    // Tanpa slug kendaraan maupun nama kendaraan: jatuh ke id + label cadangan.
    expect(container.textContent).toContain("Kendaraan tanpa nama")
    expect(container.textContent).toContain("Nonaktif")
    unmountCard(root)
  })

  it("pelanggan tanpa slug memakai id numerik pada tautan", () => {
    const { container, root } = renderCard(
      <LeadCustomerVehiclesCard
        customerSlug={null}
        customerId={3}
        customerName="Budi Santoso"
        vehicles={[row({ id: 7 })]}
      />,
    )
    const links = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    )
    expect(links).toEqual(["/master/pelanggan/3/kendaraan/b-1234-aa"])
    unmountCard(root)
  })

  it("kosong tampil pesan belum ada kendaraan", () => {
    const { container, root } = renderCard(
      <LeadCustomerVehiclesCard
        customerSlug="budi-santoso"
        customerId={3}
        customerName="Budi Santoso"
        vehicles={[]}
      />,
    )
    expect(container.textContent).toContain(
      "Belum ada kendaraan terdaftar untuk pelanggan ini",
    )
    expect(container.textContent).toContain("0 kendaraan · Budi Santoso")
    expect(container.querySelectorAll("a")).toHaveLength(0)
    unmountCard(root)
  })
})
