import { describe, expect, it } from "vitest"

import {
  INSTALL_SLUG_SOURCES,
  slugBackfillSql,
  slugTablesFromRows,
} from "@/lib/setup/slug-backfill"

describe("slugBackfillSql", () => {
  it("only fills rows that do not have a slug yet", () => {
    expect(slugBackfillSql("roles")).toContain("WHERE t.slug IS NULL")
  })

  it("derives the stem from the table's own source column", () => {
    expect(slugBackfillSql("roles")).toContain("REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-')")
    expect(slugBackfillSql("accounts")).toContain("REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-')")
  })

  it("numbers duplicate stems so the unique index is never violated", () => {
    const sql = slugBackfillSql("roles")
    expect(sql).toContain("ROW_NUMBER() OVER (PARTITION BY")
    expect(sql).toContain("IF(rn = 1, '', CONCAT('-', rn))")
  })

  it("returns null for a table it does not cover", () => {
    // Transactional tables are the one-off `scripts/backfill-slugs.mjs` pass.
    expect(slugBackfillSql("journals")).toBeNull()
  })
})

describe("slugTablesFromRows", () => {
  it("reads the table name positionally, since information_schema uppercases it", () => {
    expect(
      slugTablesFromRows([{ TABLE_NAME: "roles" }, { TABLE_NAME: "accounts" }]),
    ).toEqual(new Set(["roles", "accounts"]))
  })

  it("does not depend on the key casing", () => {
    expect(slugTablesFromRows([{ table_name: "roles" }])).toEqual(new Set(["roles"]))
  })
})

describe("INSTALL_SLUG_SOURCES", () => {
  it("covers every routed table a fresh install populates", () => {
    expect(Object.keys(INSTALL_SLUG_SOURCES)).toEqual(
      expect.arrayContaining([
        "roles",
        "accounts",
        "warehouses",
        "departments",
        "positions",
        "employees",
        "payment_methods",
        "shipping_methods",
        "unit_of_measures",
        "expense_categories",
      ]),
    )
  })
})
