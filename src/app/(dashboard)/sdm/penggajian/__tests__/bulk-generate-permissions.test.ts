import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("penggajian halaman gerbang BulkGeneratePayrollButton (create_payroll)", () => {
  it("BulkGeneratePayrollButton dibungkus CanCreate create_payroll, bukan process_payroll", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/penggajian/[[...segments]]/page.tsx"),
      "utf8",
    )
    expect(page).toMatch(
      /<CanCreate permission="create_payroll">\s*<BulkGeneratePayrollButton/,
    )
    expect(page).not.toMatch(
      /<CanCreate permission="process_payroll">\s*<BulkGeneratePayrollButton/,
    )
  })
})
