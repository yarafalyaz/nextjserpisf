import { describe, it, expect } from "vitest"
import {
  allStatementOptionParamNames,
  buildStatementRows,
  countChangedStatementOptions,
  decodeStatementOptions,
  DEFAULT_STATEMENT_OPTIONS,
  encodeStatementOptions,
  parseStatementOptions,
  statementOptionsToParams,
  type StatementAccount,
} from "../statement-display"

/**
 * Tree used below:
 *   1000 Kas & Bank (induk)
 *     ├─ 1101 Kas        own 100
 *     └─ 1102 Bank       own 900
 *   1200 Persediaan      own 0    (leaf, zero)
 *   4000 Pendapatan      own 5000 (leaf)
 */
const accounts: StatementAccount[] = [
  { id: 1, code: "1000", name: "Kas & Bank", parentId: null, ownBalance: 0 },
  { id: 2, code: "1101", name: "Kas", parentId: 1, ownBalance: 100 },
  { id: 3, code: "1102", name: "Bank", parentId: 1, ownBalance: 900 },
  { id: 4, code: "1200", name: "Persediaan", parentId: null, ownBalance: 0 },
  { id: 5, code: "4000", name: "Pendapatan", parentId: null, ownBalance: 5_000 },
]

describe("buildStatementRows", () => {
  it("shows parents with the rolled-up balance of their children", () => {
    const rows = buildStatementRows(accounts)
    const parent = rows.find((r) => r.code === "1000")
    expect(parent?.balance).toBe(1_000) // 0 + 100 + 900
    expect(parent?.hasChildren).toBe(true)
  })

  it("indents children one level beneath the parent", () => {
    const rows = buildStatementRows(accounts)
    expect(rows.find((r) => r.code === "1000")?.level).toBe(0)
    expect(rows.find((r) => r.code === "1101")?.level).toBe(1)
  })

  it("keeps the account order by code with numeric collation", () => {
    const rows = buildStatementRows(accounts)
    expect(rows.map((r) => r.code)).toEqual(["1000", "1101", "1102", "4000"])
  })

  it("hides zero-balance accounts unless asked for them", () => {
    expect(buildStatementRows(accounts).some((r) => r.code === "1200")).toBe(false)
    expect(
      buildStatementRows(accounts, { ...DEFAULT_STATEMENT_OPTIONS, showZeroBalance: true }).some((r) => r.code === "1200"),
    ).toBe(true)
  })

  it("returns nothing at all for 'Hanya Tampilkan Total'", () => {
    expect(buildStatementRows(accounts, { ...DEFAULT_STATEMENT_OPTIONS, totalsOnly: true })).toEqual([])
  })

  it("promotes children when parents are hidden", () => {
    const rows = buildStatementRows(accounts, { ...DEFAULT_STATEMENT_OPTIONS, showParents: false })
    expect(rows.some((r) => r.code === "1000")).toBe(false)
    expect(rows.find((r) => r.code === "1101")?.level).toBe(0)
  })

  it("shows only headers when children are hidden", () => {
    const rows = buildStatementRows(accounts, { ...DEFAULT_STATEMENT_OPTIONS, showChildren: false })
    expect(rows.map((r) => r.code)).toEqual(["1000"])
  })

  it("keeps a header visible even when it carries no roll-up balance", () => {
    const rows = buildStatementRows(accounts, { ...DEFAULT_STATEMENT_OPTIONS, showParentBalance: false })
    // The header is structural — an empty group is still listed (as in Accurate).
    expect(rows.find((r) => r.code === "1000")).toBeDefined()
    expect(rows.find((r) => r.code === "1000")?.balance).toBe(0)
    // Children keep their own balances.
    expect(rows.find((r) => r.code === "1102")?.balance).toBe(900)
  })

  it("does not lose a child when the parent's own balance is filtered", () => {
    const rows = buildStatementRows(
      [
        { id: 1, code: "1000", name: "Induk", parentId: null, ownBalance: -50 },
        { id: 2, code: "1001", name: "Anak", parentId: 1, ownBalance: 50 },
        { id: 3, code: "1002", name: "Anak Lain", parentId: 1, ownBalance: 500 },
      ],
      { ...DEFAULT_STATEMENT_OPTIONS, showParentBalance: false },
    )
    expect(rows.map((r) => r.code)).toEqual(["1000", "1001", "1002"])
    expect(rows.find((r) => r.code === "1001")?.level).toBe(1)
  })

  it("still lists an empty group header (matches Accurate's empty sections)", () => {
    const rows = buildStatementRows([
      { id: 1, code: "5000", name: "Beban Pokok Penjualan", parentId: null, ownBalance: 0 },
      { id: 2, code: "5001", name: "HPP Barang", parentId: 1, ownBalance: 0 },
    ])
    expect(rows.map((r) => r.code)).toEqual(["5000"])
  })

  it("treats an account whose parent is absent as a root", () => {
    const rows = buildStatementRows([{ id: 9, code: "5000", name: "HPP", parentId: 999, ownBalance: 10 }])
    expect(rows).toHaveLength(1)
    expect(rows[0].level).toBe(0)
  })
})

describe("statement option params", () => {
  it("parses overrides and keeps Accurate's defaults otherwise", () => {
    expect(parseStatementOptions({})).toEqual(DEFAULT_STATEMENT_OPTIONS)
    const parsed = parseStatementOptions({ total: "1", nol: "1", induk: "0" })
    expect(parsed.totalsOnly).toBe(true)
    expect(parsed.showZeroBalance).toBe(true)
    expect(parsed.showParents).toBe(false)
    expect(parsed.showChildren).toBe(true)
  })

  it("still accepts the older, longer param names", () => {
    const parsed = parseStatementOptions({ hanyaTotal: "1", saldoNol: "1", akunInduk: "0" })
    expect(parsed.totalsOnly).toBe(true)
    expect(parsed.showZeroBalance).toBe(true)
    expect(parsed.showParents).toBe(false)
  })

  it("prefers the current param name when both are present", () => {
    expect(parseStatementOptions({ total: "1", hanyaTotal: "0" }).totalsOnly).toBe(true)
  })

  it("writes only non-default options, using the short names", () => {
    expect(statementOptionsToParams(DEFAULT_STATEMENT_OPTIONS)).toEqual({})
    expect(statementOptionsToParams({ ...DEFAULT_STATEMENT_OPTIONS, totalsOnly: true })).toEqual({ total: "1" })
    // Everything on except the default-off "saldo nol" → a single short param.
    expect(
      statementOptionsToParams({ totalsOnly: true, showParents: true, showChildren: true, showZeroBalance: true, showParentBalance: true }),
    ).toEqual({ total: "1", nol: "1" })
  })

  it("round-trips through params", () => {
    const options = { ...DEFAULT_STATEMENT_OPTIONS, showParents: false, showZeroBalance: true }
    expect(parseStatementOptions(statementOptionsToParams(options))).toEqual(options)
  })

  it("lists every param name so stale ones can be cleared", () => {
    const names = allStatementOptionParamNames()
    expect(names).toContain("total")
    expect(names).toContain("hanyaTotal")
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("countChangedStatementOptions", () => {
  // Feeds the collapsed panel's badge, so "0" must mean "nobody touched this".
  it("reports nothing for an untouched report, even though three options default to on", () => {
    expect(countChangedStatementOptions({ ...DEFAULT_STATEMENT_OPTIONS })).toBe(0)
  })

  it("counts an option switched on and one switched off", () => {
    expect(countChangedStatementOptions({ ...DEFAULT_STATEMENT_OPTIONS, showZeroBalance: true })).toBe(1)
    expect(countChangedStatementOptions({ ...DEFAULT_STATEMENT_OPTIONS, showParents: false })).toBe(1)
  })

  it("counts every deviation at once", () => {
    expect(
      countChangedStatementOptions({
        ...DEFAULT_STATEMENT_OPTIONS,
        totalsOnly: true,
        showParents: false,
        showChildren: false,
        showZeroBalance: true,
        showParentBalance: false,
      }),
    ).toBe(5)
  })

  it("adds the percent column when it is on", () => {
    expect(countChangedStatementOptions({ ...DEFAULT_STATEMENT_OPTIONS }, true)).toBe(1)
    expect(countChangedStatementOptions({ ...DEFAULT_STATEMENT_OPTIONS, totalsOnly: true }, true)).toBe(2)
  })
})

describe("statement options cookie", () => {
  it("encodes nothing when everything is default", () => {
    expect(encodeStatementOptions(DEFAULT_STATEMENT_OPTIONS)).toBe("")
  })

  it("encodes an enabled default-off option as its name", () => {
    expect(encodeStatementOptions({ ...DEFAULT_STATEMENT_OPTIONS, totalsOnly: true, showZeroBalance: true })).toBe("total,nol")
  })

  it("encodes a disabled default-on option with a bang", () => {
    expect(encodeStatementOptions({ ...DEFAULT_STATEMENT_OPTIONS, showChildren: false })).toBe("!anak")
  })

  it("carries the percent column flag", () => {
    expect(encodeStatementOptions(DEFAULT_STATEMENT_OPTIONS, true)).toBe("persen")
  })

  it("decodes back to the same options", () => {
    const options = { ...DEFAULT_STATEMENT_OPTIONS, totalsOnly: true, showParents: false, showZeroBalance: true }
    const decoded = decodeStatementOptions(encodeStatementOptions(options, true))
    expect(decoded.options).toEqual(options)
    expect(decoded.percentColumn).toBe(true)
  })

  it("reads an empty or unknown cookie as defaults", () => {
    expect(decodeStatementOptions(undefined).options).toEqual(DEFAULT_STATEMENT_OPTIONS)
    expect(decodeStatementOptions("").options).toEqual(DEFAULT_STATEMENT_OPTIONS)
    expect(decodeStatementOptions("ngawur,,total").options.totalsOnly).toBe(true)
  })
})
