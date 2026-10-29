import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { navigation } from "@/components/layout/navigation"

/**
 * Guard: setiap `href` di menu navigasi harus punya berkas halamannya — dan
 * halaman itu harus halaman betulan.
 *
 * Tanpa ini, sebuah entri menu bisa menunjuk rute yang tidak ada dan hanya ketahuan
 * saat pengguna mengkliknya (sidebar mati / 404) — tidak tertangkap tsc, build, maupun
 * tes unit lain. `navigation-breadcrumb-parity` memeriksa arah sebaliknya (halaman →
 * label menu), bukan keberadaan halamannya.
 *
 * Pemeriksaan isi (AST, bukan regex teks): page tujuan menu TIDAK BOLEH
 *   - hanya re-export default dari berkas lain (`export { default } from "…"`),
 *   - memanggil `notFound()` tanpa kondisi (di luar if/else/ternary/&&/||/catch),
 *   - stub kosong (komponen default hanya `return null`/tanpa return).
 * Pola sah yang TIDAK ditolak (terukur di main tip, 530 page.tsx bersih):
 * `if (!x) notFound()`, `else notFound()`, `notFound()` di blok `catch`,
 * halaman `redirect()` murni, dan halaman delegasi `return renderXPage(...)`.
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
    // href di luar grup (dashboard): grup (auth) dan akar src/app.
    path.join(ROOT, "src", "app", "(auth)", base, "page.tsx"),
    path.join(ROOT, "src", "app", base, "page.tsx"),
  ]
}

function resolvePage(href: string): string | undefined {
  return pageCandidates(href).find((candidate) => fs.existsSync(candidate))
}

const GUARD_NODES = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
])

/** Masalah stub pada satu berkas page.tsx; [] = halaman betulan. */
export function pageStubIssues(source: string, fileName = "page.tsx"): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const issues: string[] = []
  let hasReExport = false
  let hasLocalExport = false

  const walk = (node: ts.Node, ancestors: ts.Node[]) => {
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause) &&
      node.exportClause.elements.some((el) => el.name.text === "default")
    ) {
      hasReExport = true
    }
    if (ts.isExportAssignment(node)) hasLocalExport = true
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      hasLocalExport = true
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "notFound") {
      const guarded =
        ancestors.some((a) => GUARD_NODES.has(a.kind)) ||
        ancestors.some(
          (a) =>
            ts.isBinaryExpression(a) &&
            (a.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
              a.operatorToken.kind === ts.SyntaxKind.BarBarToken),
        )
      if (!guarded) issues.push("notFound() tanpa kondisi")
    }

    // Stub kosong: komponen default yang tidak melempar navigasi (redirect/
    // notFound melempar, jadi halaman pengalih sah) dan tidak pernah
    // mengembalikan apa pun selain null/undefined.
    if (
      ts.isFunctionDeclaration(node) &&
      node.body &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      let throwsNavigation = false
      const returns: ts.ReturnStatement[] = []
      const scan = (n: ts.Node) => {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          ["redirect", "permanentRedirect", "notFound"].includes(n.expression.text)
        ) {
          throwsNavigation = true
        }
        if (ts.isReturnStatement(n)) returns.push(n)
        n.forEachChild(scan)
      }
      scan(node.body)
      const onlyNullReturns = returns.every(
        (r) =>
          !r.expression ||
          r.expression.kind === ts.SyntaxKind.NullKeyword ||
          r.expression.kind === ts.SyntaxKind.UndefinedKeyword,
      )
      if (!throwsNavigation && onlyNullReturns) issues.push("stub kosong (komponen default tanpa render)")
    }

    node.forEachChild((child) => walk(child, [...ancestors, node]))
  }
  walk(sf, [])

  if (hasReExport && !hasLocalExport) issues.push("hanya re-export default dari berkas lain")
  return issues
}

/** href literal di berkas layout di luar navigation.ts (header, menu pengguna, dropdown notifikasi). */
function layoutHrefs(): string[] {
  const files = [
    "src/components/layout/header.tsx",
    "src/components/layout/nav-user.tsx",
    "src/components/layout/notification-dropdown.tsx",
  ]
  const hrefs = new Set<string>()
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8")
    for (const match of source.matchAll(/href="(\/[^"]*)"/g)) hrefs.add(match[1])
  }
  return [...hrefs].sort()
}

/**
 * Quick-action command palette: literal `href: "/…/tambah"` di
 * `command-palette.tsx` — aksi cepat di luar pohon navigasi, jadi guard
 * navigation.ts tidak pernah memeriksanya.
 */
function commandPaletteHrefs(): string[] {
  const source = fs.readFileSync(
    path.join(ROOT, "src", "components", "layout", "command-palette.tsx"),
    "utf8",
  )
  const hrefs = new Set<string>()
  for (const match of source.matchAll(/href:\s*"(\/[^"]*)"/g)) hrefs.add(match[1])
  return [...hrefs].sort()
}

/**
 * Basis laporan dari tautan dinamis: literal `basePath="/laporan/…"`,
 * `buildReportHref("/laporan/…", …)`, dan `href="/laporan/…"` di seluruh src.
 * Dinormalkan ke `/laporan/<slug>` — segmen periode/filter sesudahnya ditangani
 * rute catch-all, jadi yang wajib ada ialah page untuk basisnya.
 */
function reportBaseHrefs(): string[] {
  const bases = new Set<string>()
  const patterns = [/basePath\s*[:=]\s*"(\/laporan\/[^"]+)"/g, /buildReportHref\(\s*"(\/laporan\/[^"]+)"/g, /href=\{?"(\/laporan\/[^"]+)"/g]
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(full, "utf8")
        for (const pattern of patterns) {
          for (const match of source.matchAll(pattern)) {
            bases.add("/" + match[1].split("/").filter(Boolean).slice(0, 2).join("/"))
          }
        }
      }
    }
  }
  walk(path.join(ROOT, "src"))
  return [...bases].sort()
}

describe("navigasi: setiap tautan menu punya halamannya", () => {
  it("tidak ada href yang menunjuk rute tanpa page.tsx", () => {
    const hrefs = [...new Set(collectHrefs(navigation as NavLike[]))].sort()

    const tanpaHalaman = hrefs.filter((href) => !resolvePage(href))

    expect({ hrefTanpaHalaman: tanpaHalaman }).toEqual({ hrefTanpaHalaman: [] })
  })

  it("href yang diperiksa tidak kosong (guard benar-benar bekerja)", () => {
    const hrefs = collectHrefs(navigation as NavLike[])
    expect(hrefs.length).toBeGreaterThan(100)
  })

  it("page tujuan menu bukan stub: bukan re-export saja, notFound tak bersyarat, atau kosong", () => {
    const hrefs = [...new Set(collectHrefs(navigation as NavLike[]))].sort()

    const stub: string[] = []
    for (const href of hrefs) {
      const page = resolvePage(href)
      if (!page) continue // ketiadaan halaman dilaporkan tes di atas
      for (const issue of pageStubIssues(fs.readFileSync(page, "utf8"), page)) {
        stub.push(`${href} (${path.relative(ROOT, page)}): ${issue}`)
      }
    }

    expect({ pageStub: stub }).toEqual({ pageStub: [] })
  })
})

describe("tautan di luar navigation.ts: file tujuan ada", () => {
  it("href header/menu pengguna/dropdown notifikasi (/profil, /notifikasi, …) punya page.tsx", () => {
    const hrefs = layoutHrefs()

    // Penjaga tidak vakum: dua href yang disebut eksplisit harus tertangkap.
    expect(hrefs).toContain("/profil")
    expect(hrefs).toContain("/notifikasi")

    const tanpaHalaman = hrefs.filter((href) => !resolvePage(href))
    expect({ hrefTanpaHalaman: tanpaHalaman }).toEqual({ hrefTanpaHalaman: [] })
  })

  it("quick-action command-palette (14 href /…/tambah) punya page.tsx bukan stub", () => {
    const hrefs = commandPaletteHrefs()

    // Penjaga tidak vakum: korpus quick-action saat ini tepat 14, semua /tambah.
    expect(hrefs.length).toBe(14)
    expect(hrefs.every((href) => href.endsWith("/tambah"))).toBe(true)

    const tanpaHalaman = hrefs.filter((href) => !resolvePage(href))
    expect({ hrefTanpaHalaman: tanpaHalaman }).toEqual({ hrefTanpaHalaman: [] })

    const stub: string[] = []
    for (const href of hrefs) {
      const page = resolvePage(href)
      if (!page) continue
      for (const issue of pageStubIssues(fs.readFileSync(page, "utf8"), page)) {
        stub.push(`${href} (${path.relative(ROOT, page)}): ${issue}`)
      }
    }
    expect({ pageStub: stub }).toEqual({ pageStub: [] })
  })

  it("basis tautan laporan dinamis (basePath/buildReportHref/href /laporan/…) punya page.tsx", () => {
    const bases = reportBaseHrefs()

    expect(bases.length).toBeGreaterThan(40)

    const tanpaHalaman = bases.filter((href) => !resolvePage(href))
    expect({ hrefTanpaHalaman: tanpaHalaman }).toEqual({ hrefTanpaHalaman: [] })
  })
})

describe("detektor stub page (falsifikasi)", () => {
  it("menangkap re-export saja, notFound tak bersyarat, dan stub kosong", () => {
    expect(pageStubIssues(`export { default } from "./lain"`)).toContain(
      "hanya re-export default dari berkas lain",
    )
    expect(
      pageStubIssues(
        `import { notFound } from "next/navigation"\nexport default function Page() { notFound() }`,
      ),
    ).toContain("notFound() tanpa kondisi")
    expect(pageStubIssues(`export default function Page() { return null }`)).toContain(
      "stub kosong (komponen default tanpa render)",
    )
  })

  it("melewatkan pola sah: notFound bersyarat/blok/catch, redirect, delegasi render, JSX", () => {
    const sah = [
      `import { notFound } from "next/navigation"\nexport default function Page() { if (!x) notFound(); return <div /> }`,
      `import { notFound } from "next/navigation"\nexport default function Page() { if (!x) { notFound() } return <div /> }`,
      `import { notFound } from "next/navigation"\nexport default function Page() { if (a) b(); else notFound(); return <div /> }`,
      `import { notFound } from "next/navigation"\nexport default async function Page() { try { await cek() } catch { notFound() } return <div /> }`,
      `import { redirect } from "next/navigation"\nexport default function Page() { redirect("/lain") }`,
      `export default function Page() { return renderDaftar(props, true) }`,
      `export default function Page() { return <div>isi</div> }`,
    ]
    for (const source of sah) expect(pageStubIssues(source)).toEqual([])
  })
})
