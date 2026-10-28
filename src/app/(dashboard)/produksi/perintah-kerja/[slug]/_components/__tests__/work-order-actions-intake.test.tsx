import { describe, it, expect, vi } from "vitest"

vi.mock("next/navigation", async () => (await import("./work-order-actions-test-utils")).workOrderActionsRouterModule)
vi.mock("@/actions/manufacturing.actions", async () => (await import("./work-order-actions-test-utils")).workOrderActionsManufacturingModule)
vi.mock("@/actions/inventory.actions", async () => (await import("./work-order-actions-test-utils")).workOrderActionsInventoryModule)

import { WorkOrderActions } from "../work-order-actions"
import { renderWorkOrderActions } from "./work-order-actions-test-utils"

const render = (props: Parameters<typeof renderWorkOrderActions>[1] = {}) =>
  renderWorkOrderActions(WorkOrderActions, props)

const INTAKE_HREF = "/produksi/qc/inspeksi/tambah/perintah-kerja/wo-7/tipe/vehicle_intake"

describe("WorkOrderActions gate intake F-50(b)", () => {
  it("tanpa intake: Mulai nonaktif + tautan buat inspeksi masuk + petunjuk", () => {
    const html = render({ vehicleIntakeBlocked: true, vehicleIntakeHref: INTAKE_HREF })
    expect(html).toContain("Mulai Pengerjaan")
    expect(html).toContain('disabled=""')
    expect(html).toContain(`href="${INTAKE_HREF.replace(/&/g, "&amp;")}"`)
    expect(html).toContain("Buat Inspeksi Masuk")
    expect(html).toContain("inspeksi masuk kendaraan belum tercatat")
  })

  it("intake tercatat / WO non-kendaraan: Mulai aktif, tanpa tautan intake", () => {
    for (const html of [render({ vehicleIntakeBlocked: false }), render()]) {
      expect(html).toContain("Mulai Pengerjaan")
      expect(html).not.toContain('disabled=""')
      expect(html).not.toContain("Buat Inspeksi Masuk")
    }
  })
})
