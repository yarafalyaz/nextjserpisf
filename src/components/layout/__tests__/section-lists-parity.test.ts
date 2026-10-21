import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { SETTINGS_SECTIONS, settingsPermissions } from "@/components/layout/settings-sections"
import { QC_SECTIONS } from "@/components/layout/qc-sections"

/**
 * Daftar halaman di hub Pengaturan & sub-hub QC harus selaras dengan yang ada di disk.
 *
 * Kenapa: `/pengaturan/persetujuan` pernah tidak terdaftar di hub (hanya terjangkau dari
 * widget notifikasi) karena daftarnya ditulis manual tanpa pemeriksaan. Tes ini memastikan
 * setiap halaman terdaftar, tidak ada tautan mati, dan IZIN tiap kartu sama dengan guard
 * halamannya — kelas ketidaksesuaian yang sama seperti yang ditemukan pada audit menu.
 */
const ROOT = process.cwd()
const DASHBOARD = path.join(ROOT, "src/app/(dashboard)")

/** Berkas halaman sebuah rute: langsung, atau di `[[...segments]]` (filter path). */
function pageFileOf(route: string): string {
  const direct = path.join(DASHBOARD, route.slice(1), "page.tsx")
  return fs.existsSync(direct)
    ? direct
    : path.join(DASHBOARD, route.slice(1), "[[...segments]]", "page.tsx")
}

/** Halaman statis (bukan [slug]) langsung di bawah sebuah direktori. */
function pagesIn(dir: string): string[] {
  const base = path.join(DASHBOARD, dir)
  if (!fs.existsSync(base)) return []
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("["))
    .filter(
      (entry) =>
        fs.existsSync(path.join(base, entry.name, "page.tsx")) ||
        fs.existsSync(path.join(base, entry.name, "[[...segments]]", "page.tsx")),
    )
    .map((entry) => `/${dir}/${entry.name}`)
}

/** Izin yang dipakai halaman itu (requirePermission / requireAnyPermission / requireRole). */
function guardOf(route: string): string[] {
  const source = fs.readFileSync(pageFileOf(route), "utf8")
  const single = source.match(/requirePermission\(\s*"([a-z_]+)"/)
  if (single) return [single[1]]
  const any = source.match(/requireAnyPermission\(\s*\[([\s\S]*?)\]\s*\)/)
  if (any) return [...any[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  const role = source.match(/requireRole\(\s*"([a-z_]+)"/)
  return role ? [role[1]] : []
}

const settingsListed = SETTINGS_SECTIONS.flatMap((group) => group.items)
const qcListed = QC_SECTIONS

describe("daftar hub ↔ halaman di disk", () => {
  it("setiap halaman /pengaturan terdaftar di hub", () => {
    const missing = pagesIn("pengaturan").filter(
      (route) => !settingsListed.some((item) => item.href === route),
    )
    expect(missing, `halaman pengaturan yang tidak terdaftar di hub`).toEqual([])
  })

  it("setiap halaman /produksi/qc terdaftar di sub-hub", () => {
    const missing = pagesIn("produksi/qc").filter(
      (route) => !qcListed.some((item) => item.href === route),
    )
    expect(missing, `halaman QC yang tidak terdaftar di sub-hub`).toEqual([])
  })

  it("tidak ada item terdaftar yang halamannya tidak ada (tautan mati)", () => {
    const broken = [...settingsListed, ...qcListed]
      .filter((item) => !fs.existsSync(pageFileOf(item.href)))
      .map((item) => item.href)
    expect(broken).toEqual([])
  })

  it("izin tiap item = guard halamannya", () => {
    const mismatches: string[] = []
    for (const item of [...settingsListed, ...qcListed]) {
      const guard = guardOf(item.href)
      if (guard.length === 0) continue // halaman tanpa guard eksplisit (mis. redirect)
      if (!guard.includes(item.permission)) {
        mismatches.push(`${item.href}: daftar "${item.permission}" vs halaman "${guard.join("|")}"`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it("izin hub Pengaturan = gabungan izin kartunya", () => {
    const expected = [...new Set(settingsListed.map((item) => item.permission))]
    expect(settingsPermissions().sort()).toEqual(expected.sort())
  })

  it("halaman hub memakai daftar tersebut (tidak menulis ulang)", () => {
    const pengaturan = fs.readFileSync(path.join(DASHBOARD, "pengaturan/page.tsx"), "utf8")
    const qc = fs.readFileSync(path.join(DASHBOARD, "produksi/qc/page.tsx"), "utf8")
    expect(pengaturan).toContain("SETTINGS_SECTIONS")
    expect(pengaturan).not.toMatch(/const\s+settingsNav\s*=/)
    expect(qc).toContain("QC_SECTIONS")
    expect(qc).not.toMatch(/const\s+qcModules\s*:\s*ModuleItem\[\]/)
  })
})
