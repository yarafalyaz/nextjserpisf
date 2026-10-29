import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

// BUGHUNT-2026-10-29-round2 #13: detail WO tak boleh await serial untuk
// query independen. Pin: dampak BOM diparalel di Promise.all (bukan await
// inline JSX), productId revisi dari include wo (tanpa findFirst ekstra),
// dan urutan materialNeeds -> reservations TETAP serial (lazy-expire tx sama).
const src = readFileSync(
  path.join(process.cwd(), "src/app/(dashboard)/produksi/perintah-kerja/[slug]/page.tsx"),
  "utf8",
)

describe("detail WO: paralelisasi query", () => {
  it("loadBomRevisionImpact di Promise.all, bukan await inline di JSX", () => {
    expect(src).toContain("loadBomRevisionImpact(wo.bomRevision.id)")
    expect(src).not.toContain("impact={await loadBomRevisionImpact")
    expect(src).toContain("impact={bomRevisionImpact}")
  })

  it("productId revisi BOM dari include wo, tanpa findFirst produk ekstra", () => {
    expect(src).toContain("bomRevision: { select: { id: true, revisionNo: true, slug: true, productId: true } }")
    expect(src).toContain("productId: wo.bomRevision.productId")
    expect(src).not.toContain("await prisma.bomRevision.findFirst")
  })

  it("materialNeeds tetap sebelum reservations (lazy-expire serial)", () => {
    const needs = src.indexOf("await getWorkOrderMaterialNeeds(wo.id)")
    const reservations = src.indexOf("await getWorkOrderReservations(wo.id)")
    expect(needs).toBeGreaterThan(-1)
    expect(reservations).toBeGreaterThan(needs)
  })

  it("button PO jasa pakai formatCurrency ter-cache, bukan new Intl per render", () => {
    const btn = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(dashboard)/produksi/perintah-kerja/[slug]/_components/create-service-po-button.tsx",
      ),
      "utf8",
    )
    expect(btn).not.toContain("new Intl.")
    expect(btn).toContain("formatCurrency(it.cost)")
    expect(btn).toContain("formatCurrency(total)")
  })
})
