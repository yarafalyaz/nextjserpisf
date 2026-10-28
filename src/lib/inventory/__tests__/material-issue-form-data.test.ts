import { describe, it, expect } from "vitest"
import {
  filterWorkOrdersWithoutActiveMi,
  ACTIVE_MATERIAL_ISSUE_STATUSES,
} from "../material-issue-form-data"

// WO-BR-004 frontend: dropdown tambah MI sembunyikan WO ber-MI aktif
// (draft/processing/completed); guard server tetap penolak akhir.
describe("filterWorkOrdersWithoutActiveMi", () => {
  const wos = [
    { id: 1, documentNo: "WO-001" },
    { id: 2, documentNo: "WO-002" },
    { id: 3, documentNo: "WO-003" },
    { id: 4, documentNo: "WO-004" },
  ]

  it("sembunyikan WO ber-MI draft/processing/completed", () => {
    const out = filterWorkOrdersWithoutActiveMi(wos, [
      { workOrderId: 1, status: "draft" },
      { workOrderId: 2, status: "processing" },
      { workOrderId: 3, status: "completed" },
    ])
    expect(ACTIVE_MATERIAL_ISSUE_STATUSES).toEqual(["draft", "processing", "completed"])
    expect(out).toEqual([{ id: 4, documentNo: "WO-004" }])
  })

  it("MI batal tak memblokir WO (pengganti boleh lahir)", () => {
    const out = filterWorkOrdersWithoutActiveMi(wos, [
      { workOrderId: 1, status: "cancelled" },
      { workOrderId: null, status: "draft" },
    ])
    expect(out).toEqual(wos)
  })

  it("tanpa daftar MI tampilkan semua (jangan sembunyikan opsi sah)", () => {
    expect(filterWorkOrdersWithoutActiveMi(wos, null)).toEqual(wos)
    expect(filterWorkOrdersWithoutActiveMi(wos, undefined)).toEqual(wos)
    expect(filterWorkOrdersWithoutActiveMi([], [{ workOrderId: 9, status: "draft" }])).toEqual([])
  })

  it("daftar kosong = semua WO lolos, referensi input tak dimutasi", () => {
    const out = filterWorkOrdersWithoutActiveMi(wos, [])
    expect(out).toEqual(wos)
    expect(out).not.toBe(wos)
  })

  it("urutan + label WO tampil tak berubah", () => {
    const out = filterWorkOrdersWithoutActiveMi(wos, [{ workOrderId: 2, status: "completed" }])
    expect(out.map((w) => w.documentNo)).toEqual(["WO-001", "WO-003", "WO-004"])
  })
})
