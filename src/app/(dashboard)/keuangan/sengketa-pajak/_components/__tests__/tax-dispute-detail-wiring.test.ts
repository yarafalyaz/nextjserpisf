import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

describe("detail sengketa pajak — tombol Batal memakai canAct", () => {
  it("CancelTaxAssessmentButton hanya render bila canEdit && canAct (bukan cek BATAL parsial)", () => {
    const src = readFileSync(
      join(ROOT, "src/app/(dashboard)/keuangan/sengketa-pajak/[slug]/page.tsx"),
      "utf8",
    )
    expect(src).toContain("const canAct = assessment.status !== \"BATAL\" && assessment.status !== \"SELESAI\"")
    expect(src).toMatch(/\{canEdit && canAct \? \(\s*<CancelTaxAssessmentButton/)
    expect(src).not.toContain('canEdit && assessment.status !== "BATAL"')
  })
})
