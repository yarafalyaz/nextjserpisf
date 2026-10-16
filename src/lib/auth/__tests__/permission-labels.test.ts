import { describe, expect, it } from "vitest"

import { PERMISSIONS } from "@/lib/setup/base-data"
import {
  permissionGroupLabel,
  permissionLabel,
} from "@/lib/auth/permission-labels"

describe("permissionLabel", () => {
  it("joins the Indonesian verb with the subject it acts on", () => {
    expect(permissionLabel("create_purchase_orders")).toBe("Tambah Pesanan Pembelian")
    expect(permissionLabel("approve_leave_requests")).toBe("Setujui Pengajuan Cuti")
  })

  it("maps both edit and update to the same verb", () => {
    expect(permissionLabel("edit_items")).toBe("Ubah Barang")
    expect(permissionLabel("update_items")).toBe("Ubah Barang")
  })

  it("falls back to the raw key when the verb or subject is unknown", () => {
    expect(permissionLabel("frobnicate_items")).toBe("frobnicate_items")
    expect(permissionLabel("create_widgets")).toBe("create_widgets")
  })

  it("translates every permission in the catalogue", () => {
    const untranslated = PERMISSIONS.filter((name) => permissionLabel(name) === name)
    expect(untranslated).toEqual([])
  })
})

describe("permissionGroupLabel", () => {
  it("translates a permission prefix into its heading", () => {
    expect(permissionGroupLabel("approve")).toBe("Setujui")
    expect(permissionGroupLabel("view")).toBe("Lihat")
  })

  it("falls back to the raw prefix for an unknown verb", () => {
    expect(permissionGroupLabel("frobnicate")).toBe("frobnicate")
  })
})
