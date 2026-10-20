import { describe, expect, it } from "vitest"

import { buildStatementRows, type StatementAccount } from "@/lib/reports/statement-display"

describe("statement-display presisi sen", () => {
  it("rollup induk 17 anak sen persis, bukan float mentah", () => {
    const accounts: StatementAccount[] = [
      { id: 1, code: "1000", name: "Aset", parentId: null, ownBalance: 0 },
      ...Array.from({ length: 17 }, (_, i) => ({
        id: i + 2,
        code: `110${i}`,
        name: `Kas ${i}`,
        parentId: 1,
        ownBalance: 0.24,
      })),
    ]
    const rows = buildStatementRows(accounts)
    const parent = rows.find((r) => r.id === 1)
    expect(parent?.balance).toBe(4.08)
  })
})
