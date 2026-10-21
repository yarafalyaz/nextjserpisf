// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { VehicleMarginCard } from "../vehicle-margin-card"
import { buildVehicleMargin } from "@/lib/reports/vehicle-margin"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { projectPlWithCost } from "./project-pl-test-fixtures"

afterEach(() => {
  clearRenderedCards()
})

function reportExample(hasUnlinkedMaterial = false) {
  const margin = buildVehicleMargin({
    projects: [
      {
        customerVehicleId: 7,
        vehiclePlate: "B 1234 AA",
        customerName: "PT A",
        pl: projectPlWithCost(),
      },
    ],
    jobs: [
      {
        workOrderId: 11,
        customerVehicleId: 7,
        vehiclePlate: "B 1234 AA",
        customerName: "PT A",
        billedAmount: 0,
        actualCost: 0,
        hasUnlinkedMaterial,
      },
    ],
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

  it("penanda material langsung belum termasuk tampil verbatim; tanpa penanda tidak tampil", () => {
    const { container, root } = renderCard(
      <VehicleMarginCard report={reportExample(true)} />,
    )
    expect(container.textContent ?? "").toContain("biaya material langsung belum termasuk")
    unmountCard(root)

    const without = renderCard(<VehicleMarginCard report={reportExample()} />)
    expect(without.container.textContent ?? "").not.toContain("biaya material langsung belum termasuk")
    unmountCard(without.root)
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
