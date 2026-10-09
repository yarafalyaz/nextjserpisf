import { describe, it, expect } from "vitest"
import { columnMeta, isActionsColumnId } from "../table-mobile-cards"
import type { ErpColumnDef } from "@/lib/table"

describe("isActionsColumnId", () => {
  it.each(["actions", "aksi", "Aksi", "row-actions", "opsi", "menu"])(
    "treats %s as the actions column",
    (id) => {
      expect(isActionsColumnId(id)).toBe(true)
    },
  )

  it.each(["name", "total", "status"])("does not treat %s as an actions column", (id) => {
    expect(isActionsColumnId(id)).toBe(false)
  })
})

describe("columnMeta", () => {
  it("returns the declared meta for a column", () => {
    const col = { id: "x", meta: { mobile: true, mobilePrimary: true } } as ErpColumnDef<
      { id: number },
      unknown
    >
    expect(columnMeta(col)).toEqual({ mobile: true, mobilePrimary: true })
  })

  it("defaults to an empty object when a column has no meta", () => {
    const col = { id: "x" } as ErpColumnDef<{ id: number }, unknown>
    expect(columnMeta(col)).toEqual({})
  })
})
