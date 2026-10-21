import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

// Aksi server menyeret rantai auth yang tak bisa dimuat di vitest; yang diuji
// pemetaan gate intake -> tombol, bukan aksinya.
vi.mock("@/actions/manufacturing.actions", () => ({
  startWorkOrder: vi.fn(async () => ({ success: true })),
  completeWorkOrder: vi.fn(async () => ({ success: true })),
  createMaterialIssueFromWorkOrder: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/actions/inventory.actions", () => ({
  reviseWorkOrderItems: vi.fn(async () => ({ success: true })),
}))

import { WorkOrderActions } from "../work-order-actions"

const INTAKE_HREF = "/produksi/qc/inspeksi/tambah/perintah-kerja/wo-7/tipe/vehicle_intake"

function render(props: Partial<React.ComponentProps<typeof WorkOrderActions>> = {}) {
  return renderToStaticMarkup(
    <WorkOrderActions
      workOrderId={7}
      status="draft"
      hasCompletedMaterialIssue={false}
      defaultWarehouseId={1}
      {...props}
    />,
  )
}

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
