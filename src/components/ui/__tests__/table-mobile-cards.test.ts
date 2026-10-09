import { describe, it, expect } from "vitest"
import { columnMeta, isActionsColumnId } from "../table-mobile-cards"
import type { ErpColumnDef } from "@/lib/table"

describe("isActionsColumnId", () => {
  it.each(["actions", "aksi", "Aksi", "row-actions", "opsi", "menu", "row_actions"])(
    "treats %s as the actions column",
    (id) => {
      expect(isActionsColumnId(id)).toBe(true)
    },
  )

  it.each(["name", "total", "status", "no", "action", "actionType", "transaction"])(
    "does not treat %s as an actions column",
    (id) => {
      expect(isActionsColumnId(id)).toBe(false)
    },
  )

  it("does not mistake the activity log's audit 'action' value column for the actions menu", () => {
    // id === "action" (singular) renders the audit action badge and must stay a
    // normal detail line, while id === "actions" is the kebab menu.
    expect(isActionsColumnId("action")).toBe(false)
    expect(isActionsColumnId("actions")).toBe(true)
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
