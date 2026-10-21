// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { VehicleMarginCard } from "../vehicle-margin-card"
import { buildVehicleMargin } from "@/lib/reports/vehicle-margin"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { projectPlWithCost } from "./project-pl-test-fixtures"

afterEach(() => {
  clearRenderedCards()
})

function reportExample() {
  const margin = buildVehicleMargin({
    projects: [
      {
        customerVehicleId: 7,
        vehiclePlate: "B 1234 AA",
        customerName: "PT A",
        pl: projectPlWithCost(),
      },
    ],
    jobs: [],
    directInvoices: [
      {
        id: 2,
        customerVehicleId: null,
        vehiclePlate: null,
        customerName: "PT B",
        revenue: 1_000_000,
      },
    ],
  })
  return {
    ...margin,
    periodLabel: "Periode 1–31 Oktober 2026",
    periodCaption: "Periode 1–31 Oktober 2026",
  }
}

describe("VehicleMarginCard F-2026-10-22-001", () => {
  it("angka loader tampil persis: kendaraan 7 pendapatan 20jt, produksi 5jt, margin 15jt", () => {
    const { container, root } = renderCard(<VehicleMarginCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="margin job kendaraan"]')).not.toBeNull()
    expect(text).toContain("Margin Job Kendaraan")
    expect(text).toContain("B 1234 AA")
    expect(text).toContain("20.000.000,00")
    expect(text).toContain("5.000.000,00")
    expect(text).toContain("15.000.000,00")
    expect(text).toContain("75.0%")
    expect(text).not.toContain("Laba Rugi")
    unmountCard(root)
  })

  it("ember Tanpa kendaraan tampil terakhir dan invoice langsung tertanda Sebagian", () => {
    const { container, root } = renderCard(<VehicleMarginCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Tanpa kendaraan")
    expect(text).toContain("Sebagian")
    expect(text.indexOf("B 1234 AA")).toBeLessThan(text.indexOf("Tanpa kendaraan"))
    unmountCard(root)
  })

  it("kosong tampil pesan, bukan tabel", () => {
    const report = {
      ...buildVehicleMargin({ projects: [], jobs: [], directInvoices: [] }),
      periodLabel: "Periode",
      periodCaption: "Periode",
    }
    const { container, root } = renderCard(<VehicleMarginCard report={report} />)
    expect(container.textContent ?? "").toContain("Tidak ada margin job kendaraan dalam periode ini")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
