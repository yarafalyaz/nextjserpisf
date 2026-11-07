import { describe, it, expect, vi } from "vitest"

vi.mock("next/navigation", async () => (await import("./work-order-actions-test-utils")).workOrderActionsRouterModule)
vi.mock("@/actions/manufacturing.actions", async () => (await import("./work-order-actions-test-utils")).workOrderActionsManufacturingModule)
vi.mock("@/actions/inventory.actions", async () => (await import("./work-order-actions-test-utils")).workOrderActionsInventoryModule)

import { WorkOrderActions } from "../work-order-actions"
import { renderWorkOrderActions } from "./work-order-actions-test-utils"

/**
 * Regresi putaran 223: halaman detail perintah kerja hanya menuntut
 * `view_work_orders`, sedangkan setiap tombol lifecycle menuntut izin
 * tulisnya sendiri (startWorkOrder/reviseWorkOrderItems → edit_work_orders,
 * createMaterialIssueFromWorkOrder → create_material_issues, completeWorkOrder
 * → complete_work_orders). Tanpa prop izin, peran lihat-saja melihat seluruh
 * bar aksi dan setiap klik berakhir FORBIDDEN dari action.
 */
const render = (props: Parameters<typeof renderWorkOrderActions>[1] = {}) =>
  renderWorkOrderActions(WorkOrderActions, props)

describe("WorkOrderActions menghormati izin tulis", () => {
  it("tanpa izin apa pun, bar aksi kosong total", () => {
    for (const status of ["draft", "pending", "in_progress"]) {
      const html = render({
        status,
        canEdit: false,
        canIssueMaterial: false,
        canComplete: false,
        canCreateInspection: false,
        canCancel: false,
      })
      expect(html, `status ${status} masih merender aksi`).not.toContain("<button")
      expect(html).not.toContain("Mulai Pengerjaan")
      expect(html).not.toContain("Buat Pengeluaran Material")
      expect(html).not.toContain("Selesaikan")
    }
  })

  it("hanya pemegang edit_work_orders melihat Mulai Pengerjaan", () => {
    expect(render({ status: "draft", canEdit: false, canCreateInspection: false })).not.toContain(
      "Mulai Pengerjaan",
    )
    expect(render({ status: "draft", canEdit: true })).toContain("Mulai Pengerjaan")
  })

  it("create_material_issues memisahkan tombol pengeluaran material dari izin edit", () => {
    // Punya edit, tidak punya create_material_issues: Selesaikan/Ganti Item
    // boleh tampil, pengeluaran material tidak.
    const html = render({
      status: "in_progress",
      hasCompletedMaterialIssue: true,
      canEdit: true,
      canIssueMaterial: false,
      canComplete: true,
    })
    expect(html).not.toContain("Buat Pengeluaran Material")
    expect(html).toContain("Selesaikan")
  })

  it("complete_work_orders memisahkan tombol Selesaikan", () => {
    // hasCompletedMaterialIssue=false supaya tombol pengeluaran material lolos
    // gerbang WO-BR-004 dan yang diuji benar-benar izin, bukan status MI.
    const html = render({
      status: "in_progress",
      hasCompletedMaterialIssue: false,
      canEdit: true,
      canIssueMaterial: true,
      canComplete: false,
    })
    expect(html).not.toContain("Selesaikan")
    expect(html).toContain("Buat Pengeluaran Material")
  })

  /**
   * Regresi putaran 232: cancelWorkOrder adalah SATU-SATUNYA jalur
   * in_progress -> cancelled (menolak status lain) dan menuntut alasan
   * non-kosong. Tanpa tombol ini perintah kerja yang salah input tidak punya
   * jalan keluar dari UI — Selesaikan memaksa job selesai, sedangkan
   * closeWorkOrder hanya menerima status completed.
   */
  it("tombol Batalkan tampil untuk perintah kerja berjalan", () => {
    const html = render({ status: "in_progress", canCancel: true })
    expect(html).toContain("Batalkan")
  })

  it("tombol Batalkan digerbangi complete_work_orders", () => {
    const html = render({ status: "in_progress", canCancel: false, canEdit: false, canIssueMaterial: false, canComplete: false })
    expect(html).not.toContain("Batalkan")
  })

  it("gate intake: tombol buat inspeksi butuh manage_qc_inspections", () => {
    const href = "/produksi/qc/inspeksi/tambah/perintah-kerja/7/tipe/vehicle_intake"
    const withPerm = render({
      status: "draft",
      vehicleIntakeBlocked: true,
      vehicleIntakeHref: href,
      canEdit: true,
      canCreateInspection: true,
    })
    expect(withPerm).toContain("Buat Inspeksi Masuk")

    const withoutPerm = render({
      status: "draft",
      vehicleIntakeBlocked: true,
      vehicleIntakeHref: href,
      canEdit: true,
      canCreateInspection: false,
    })
    expect(withoutPerm).not.toContain("Buat Inspeksi Masuk")
    // Petunjuk & tombol nonaktif tetap ada supaya operator tahu alasannya.
    expect(withoutPerm).toContain("inspeksi masuk kendaraan belum tercatat")
  })

  it("default prop tetap permisif agar pemanggil lama tidak berubah diam-diam", () => {
    expect(render({ status: "draft" })).toContain("Mulai Pengerjaan")
  })
})
