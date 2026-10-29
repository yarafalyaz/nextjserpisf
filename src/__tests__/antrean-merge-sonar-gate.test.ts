import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// BUGHUNT-2026-10-29-round2 #11: SonarCloud Code Analysis = check GitHub App
// eksternal, bukan job ci.yml. Menuntut bucket "pass" mengunci antrean total
// bila App mati. Gerbang kini non-blokir (pass/skipping/absent boleh), fail/
// cancel tetap gagal lewat cek bucket gagal global. 4 check internal tetap wajib.
const ROOT = join(__dirname, "..", "..")
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8")

describe("antrean merge: SonarCloud non-blokir", () => {
  it.each([
    ".github/workflows/antrean-merge.yml",
    "scripts/antrean-merge.sh",
  ])("%s tidak menuntut SonarCloud pass persis", (rel) => {
    const src = read(rel)
    expect(src).not.toContain('bucket_of("SonarCloud Code Analysis") == "pass"\n')
    expect(src).not.toMatch(/and bucket_of\("SonarCloud Code Analysis"\) == "pass"\s*$/m)
    expect(src).toContain('bucket_of("SonarCloud Code Analysis") == "absent"')
    // 4 gerbang internal tetap wajib.
    for (const name of ["Lint", "Unit Tests", "Build Next.js", "DB Integration Tests"]) {
      expect(src).toContain(`wajib_ok("${name}")`)
    }
    // fail/cancel tetap menggagalkan.
    expect(src).toContain('"fail"')
  })

  it("ci.yml tidak menambah job Sonar internal (satu sumber kebenaran = App)", () => {
    const ci = read(".github/workflows/ci.yml")
    expect(ci.toLowerCase()).not.toContain("sonar")
  })

  it("docs/antrean-merge.md konsisten non-blokir", () => {
    const doc = read("docs/antrean-merge.md")
    expect(doc).toContain("SonarCloud non-blokir")
    expect(doc).not.toContain("SonarCloud PASS dengan `head_sha`")
  })
})
