import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { resolveEditPerm } from "@/lib/auth/action-perms"

/**
 * Regression guard for the RBAC drift fixed in #53.
 *
 * The mass "add requirePermission to 125 pages" pass picked module-level
 * permissions for many detail/edit pages (`view_sales_orders`, `edit_inventory`,
 * `edit_production`, ...) while the list page and the server action the form
 * submits to enforce a resource-level permission (`view_sales_invoices`,
 * `edit_stock_adjustments`, `edit_work_orders`, ...).
 *
 * Two concrete failures followed for *seeded* roles:
 *   - fail-closed: `finance`/`warehouse`/`kepala_bengkel` held the resource
 *     permission but were redirected out of the detail/edit page because it
 *     demanded a different one;
 *   - fail-open at the page level: `purchasing` could open the goods-receipt or
 *     vendor-payment edit form (edit_purchase_orders) although the action then
 *     rejected the save (edit_goods_receipts / edit_vendor_payments).
 *
 * These tests pin both sides of the invariant:
 *   1. every registered detail page uses the same permission as its list page;
 *   2. every registered edit page uses `resolveEditPerm(route)` — the same
 *      permission the row's Edit button and the update action use.
 */

const ROOT = process.cwd()
const DASHBOARD = join(ROOT, "src/app/(dashboard)")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue
      walk(full, out)
    } else if (entry.name === "page.tsx") {
      out.push(full)
    }
  }
  return out
}

function permissionOf(file: string): string | null {
  const match = readFileSync(file, "utf8").match(/requirePermission\(\s*"([^"]+)"/)
  return match ? match[1] : null
}

/** `/penjualan/faktur/[id]` → `/penjualan/faktur` */
function routeFromDir(dir: string): string {
  const rel = relative(DASHBOARD, dir).split("\\").join("/")
  return "/" + rel.split("/").filter((segment) => !/^\[.+\]$/.test(segment)).join("/")
}

const PAGES = walk(DASHBOARD)
/** Detail pages whose permission must mirror their list page. */
const MIRRORED_MODULES = ["/penjualan", "/pembelian", "/inventaris", "/produksi", "/aset", "/kendaraan"]

/**
 * Create pages are server components, so their guard is the permission the
 * create action enforces. Kept explicit (the registry only maps edit/delete).
 */
const CREATE_PAGE_CASES: Array<[string, string]> = [
  ["aset/kategori/tambah/page.tsx", "create_asset_categories"],
  ["aset/merek/tambah/page.tsx", "create_asset_brands"],
  ["aset/transfer/tambah/page.tsx", "create_asset_transfers"],
  ["kendaraan/merek/tambah/page.tsx", "create_vehicle_brands"],
]

/** Client pages whose permission check lives in a parent layout. */
const LAYOUT_GUARD_CASES: Array<[string, string]> = [
  ["app/(dashboard)/inventaris/scan/layout.tsx", "view_inventory"],
]

describe("paritas izin halaman detail/edit vs list/action (#53)", () => {
  it("menemukan cukup banyak halaman untuk tidak vakum", () => {
    expect(PAGES.length).toBeGreaterThan(200)
  })

  it("setiap halaman detail memakai izin yang sama dengan halaman list-nya", () => {
    const offenders: string[] = []

    for (const detail of PAGES) {
      const dir = join(detail, "..")
      const rel = relative(DASHBOARD, dir).split("\\").join("/")
      if (!/\/\[[^\]]+\]$/.test(rel)) continue
      if (!MIRRORED_MODULES.some((prefix) => `/${rel}`.startsWith(prefix + "/"))) continue

      const listPage = join(dir, "..", "page.tsx")
      const detailPerm = permissionOf(detail)
      let listPerm: string | null = null
      try {
        listPerm = permissionOf(listPage)
      } catch {
        listPerm = null
      }
      if (!detailPerm || !listPerm) continue
      if (detailPerm !== listPerm) offenders.push(`${rel}: detail=${detailPerm} list=${listPerm}`)
    }

    expect(offenders, `Halaman detail dengan izin berbeda dari halaman list:\n${offenders.join("\n")}`).toEqual([])
  })

  it("setiap halaman edit memakai izin dari registry ROUTE_PERMS (sama dengan action-nya)", () => {
    const offenders: string[] = []
    let checked = 0

    for (const page of PAGES) {
      const dir = join(page, "..")
      if (dir.split("/").pop() !== "ubah") continue

      const route = routeFromDir(dir)
      const expected = resolveEditPerm(route)
      if (!expected) continue // route not covered by the registry

      const actual = permissionOf(page)
      checked += 1
      if (actual !== expected) offenders.push(`${route}: page=${actual} registry=${expected}`)
    }

    expect(checked).toBeGreaterThan(20)
    expect(offenders, `Halaman edit dengan izin berbeda dari server action:\n${offenders.join("\n")}`).toEqual([])
  })

  it("setiap halaman tambah memakai izin create yang sama dengan action-nya", () => {
    const offenders = CREATE_PAGE_CASES
      .filter(([rel, expected]) => permissionOf(join(DASHBOARD, rel)) !== expected)
      .map(([rel, expected]) => `${rel}: expected ${expected}`)

    expect(offenders, `Halaman tambah dengan izin berbeda dari action:\n${offenders.join("\n")}`).toEqual([])
  })

  it("layout halaman client memakai izin view modulnya", () => {
    const offenders = LAYOUT_GUARD_CASES
      .filter(([rel, expected]) => permissionOf(join(ROOT, "src", rel)) !== expected)
      .map(([rel, expected]) => `${rel}: expected ${expected}`)

    expect(offenders, `Layout tanpa guard izin yang benar:\n${offenders.join("\n")}`).toEqual([])
  })

  it("setiap halaman hub modul memiliki guard izin (requirePermission atau requireAnyPermission)", () => {
    const hubModules = [
      "master",
      "penjualan",
      "pembelian",
      "inventaris",
      "produksi",
      "sdm",
      "keuangan",
      "crm",
      "laporan",
      "aset",
      "kendaraan",
      "proyek",
      "pengaturan",
    ]

    const unguarded: string[] = []
    for (const mod of hubModules) {
      const pageFile = join(DASHBOARD, mod, "page.tsx")
      const src = readFileSync(pageFile, "utf8")
      const hasGuard =
        /requirePermission\(\s*['"][^'"]+['"]\s*\)/.test(src) ||
        /requireAnyPermission\(/.test(src)
      if (!hasGuard) unguarded.push(mod)
    }

    expect(unguarded, `Halaman hub modul tanpa guard izin:\n${unguarded.join("\n")}`).toEqual([])
  })
})
