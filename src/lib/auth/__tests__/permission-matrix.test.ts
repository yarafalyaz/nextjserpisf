import { describe, expect, it } from "vitest"

import { buildPermissionMatrix, type CatalogModuleInput } from "../permission-matrix"

const modules: CatalogModuleInput[] = [
  {
    key: "sales",
    name: "Penjualan",
    route: "/penjualan",
    icon: "DollarSign",
    actions: [
      { key: "view", resource: "sales_invoices", permissionKey: "view_sales_invoices", label: "Faktur Penjualan" },
      { key: "create", resource: "sales_invoices", permissionKey: "create_sales_invoices", label: "Faktur Penjualan" },
      { key: "delete", resource: "sales_invoices", permissionKey: "delete_sales_invoices", label: "Faktur Penjualan" },
      { key: "view", resource: "quotations", permissionKey: "view_quotations", label: "Penawaran" },
    ],
  },
]

describe("buildPermissionMatrix", () => {
  it("menggabungkan aksi satu entitas menjadi SATU baris", () => {
    const { matrix } = buildPermissionMatrix(modules, new Map())
    expect(matrix[0].rows.map((r) => r.resource)).toEqual(["sales_invoices", "quotations"])
    expect(matrix[0].rows[0].cells.map((c) => c.verb)).toEqual(["view", "create", "delete"])
  })

  it("menyusun kolom mengikuti urutan verba kanonik, bukan urutan baris katalog", () => {
    const { matrix } = buildPermissionMatrix(modules, new Map())
    // katalog di atas urutannya view, create, delete — kolom harus view, create, delete
    expect(matrix[0].columns).toEqual(["view", "create", "delete"])
    // modul dengan verba "edit" menaruh kolomnya sebelum "delete"
    const withEdit = buildPermissionMatrix(
      [
        {
          ...modules[0],
          actions: [
            { key: "delete", resource: "items", permissionKey: "delete_items", label: "Barang" },
            { key: "edit", resource: "items", permissionKey: "edit_items", label: "Barang" },
          ],
        },
      ],
      new Map(),
    )
    expect(withEdit.matrix[0].columns).toEqual(["edit", "delete"])
  })

  it("membawa permissionId ke tiap sel dan melaporkan yang belum ada di database", () => {
    const ids = new Map([
      ["view_sales_invoices", 11],
      ["create_sales_invoices", 12],
    ])
    const { matrix, missingPermissionKeys } = buildPermissionMatrix(modules, ids)
    const cells = matrix[0].rows[0].cells
    expect(cells.find((c) => c.verb === "view")?.permissionId).toBe(11)
    expect(cells.find((c) => c.verb === "create")?.permissionId).toBe(12)
    // delete_sales_invoices + view_quotations belum di-seed → dilaporkan, bukan dibiarkan hening
    expect(missingPermissionKeys).toEqual(["delete_sales_invoices", "view_quotations"])
    expect(cells.find((c) => c.verb === "delete")?.permissionId).toBeNull()
  })

  it("menjaga metadata modul tetap utuh", () => {
    const { matrix } = buildPermissionMatrix(modules, new Map())
    expect(matrix[0]).toMatchObject({
      key: "sales",
      name: "Penjualan",
      route: "/penjualan",
      icon: "DollarSign",
    })
  })
})
