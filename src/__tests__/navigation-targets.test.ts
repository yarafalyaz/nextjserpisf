import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { navigation } from "@/components/layout/navigation"

/**
 * Guard: setiap `href` di menu navigasi harus punya berkas halamannya.
 *
 * Tanpa ini, sebuah entri menu bisa menunjuk rute yang tidak ada dan hanya ketahuan
 * saat pengguna mengkliknya (sidebar mati / 404) — tidak tertangkap tsc, build, maupun
 * tes unit lain. `navigation-breadcrumb-parity` memeriksa arah sebaliknya (halaman →
 * label menu), bukan keberadaan halamannya.
 */
const ROOT = process.cwd()
const DASHBOARD = path.join(ROOT, "src", "app", "(dashboard)")

interface NavLike {
  label?: string
  href?: string
  children?: NavLike[]
}

function collectHrefs(items: NavLike[], out: string[] = []): string[] {
  for (const item of items) {
    if (typeof item.href === "string" && item.href) out.push(item.href)
    if (Array.isArray(item.children)) collectHrefs(item.children, out)
  }
  return out
}

/** Jalur halaman yang sah untuk sebuah href: halaman statis, atau rute catch-all laporan. */
function pageCandidates(href: string): string[] {
  const base = href === "/" ? "" : href.replace(/\/+$/, "")
  return [
    path.join(DASHBOARD, base, "page.tsx"),
    path.join(DASHBOARD, base, "[[...segments]]", "page.tsx"),
  ]
}

describe("navigasi: setiap tautan menu punya halamannya", () => {
  it("tidak ada href yang menunjuk rute tanpa page.tsx", () => {
    const hrefs = [...new Set(collectHrefs(navigation as NavLike[]))].sort()

    const tanpaHalaman = hrefs.filter(
      (href) => !pageCandidates(href).some((candidate) => fs.existsSync(candidate)),
    )

    expect({ hrefTanpaHalaman: tanpaHalaman }).toEqual({ hrefTanpaHalaman: [] })
  })

  it("href yang diperiksa tidak kosong (guard benar-benar bekerja)", () => {
    const hrefs = collectHrefs(navigation as NavLike[])
    expect(hrefs.length).toBeGreaterThan(100)
  })
})
