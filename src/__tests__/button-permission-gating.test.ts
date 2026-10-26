import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Ratchet gerbang tombol tulis (scan anomali 2026-10-21 kelas E/A-16).
 *
 * Penyakitnya: halaman daftar/detail merender tombol Tambah/Ubah/Hapus tanpa
 * pemeriksaan izin, sementara halaman tujuan/server action menolak peran
 * lihat-saja — pengguna mengklik, terpental diam ke dasbor atau baru ditolak
 * sesudah form terisi. Pola yang disahkan: tombol dibungkus
 * `<CanCreate permission="…">` (atau ekuivalennya: boolean `hasPermission`
 * dari server diteruskan sebagai prop ke komponen klien).
 *
 * Penjaga ini memindai semua page.tsx dashboard: halaman yang merender
 * DeleteButton atau tautan ke `/tambah` WAJIB memuat CanCreate/hasPermission
 * di berkasnya (atau di komponen tabel saudaranya untuk daftar yang tombolnya
 * hidup di _components). Pengecualian sah dicatat dua arah di
 * PAGE_LEVEL_GATED: halaman yang SELURUHNYA menuntut izin tulis yang sama,
 * jadi tombol di dalamnya tidak perlu gerbang per tombol.
 */

const DASHBOARD = join(process.cwd(), "src/app/(dashboard)")

/** Halaman yang halamannya sendiri menuntut izin tulis — tombol tak perlu gerbang. */
const PAGE_LEVEL_GATED = new Set([
  "pengaturan/workflow/page.tsx",
  // F-2026-10-25-018-S: halaman pengajuan mandiri menuntut
  // create_employee_loan_requests untuk SELURUH halaman; tombol Ajukan
  // menuju form yang digerbang izin sama.
  "sdm/pinjaman-saya/page.tsx",
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry === "page.tsx") out.push(full)
  }
  return out
}

const pages = walk(DASHBOARD).map((full) => ({
  full,
  rel: full.slice(DASHBOARD.length + 1),
}))

/** Pola gerbang yang sah: komponen CanCreate, hasPermission server, atau cek daftar izin sesi. */
function isGated(src: string): boolean {
  return (
    src.includes("CanCreate") ||
    src.includes("hasPermission") ||
    src.includes("userPerms.includes") ||
    src.includes("permissions.includes")
  )
}

/** Tombol daftar sering hidup di komponen tabel saudara (_components). */
function siblingSources(rel: string): string {
  const dir = join(DASHBOARD, rel, "..", "_components")
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n")
  } catch {
    return ""
  }
}

describe("tombol tulis digerbangi izin", () => {
  it("halaman dengan DeleteButton memeriksa izin di berkasnya", () => {
    const offenders: string[] = []
    for (const { full, rel } of pages) {
      if (PAGE_LEVEL_GATED.has(rel)) continue
      const src = readFileSync(full, "utf8")
      if (!src.includes("DeleteButton")) continue
      if (isGated(src)) continue
      offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it("halaman dengan tautan tambah memeriksa izin (di halaman atau tabel saudaranya)", () => {
    const offenders: string[] = []
    for (const { full, rel } of pages) {
      if (PAGE_LEVEL_GATED.has(rel)) continue
      if (rel.includes("/tambah/")) continue
      const src = readFileSync(full, "utf8")
      const hasCreateLink = /href=\{?["`][^"`]*\/tambah/.test(src)
      if (!hasCreateLink) continue
      if (isGated(src)) continue
      if (siblingSources(rel).match(/CanCreate|hasPermission|editPermission|deletePermission|userPerms\.includes/)) continue
      offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it("daftar pengecualian tidak menyimpan entri usang", () => {
    for (const rel of PAGE_LEVEL_GATED) {
      const src = readFileSync(join(DASHBOARD, rel), "utf8")
      expect(
        /requirePermission\("(manage_|create_|edit_|delete_)/.test(src),
        `${rel} diklaim page-level gated tetapi guard halamannya bukan izin tulis`,
      ).toBe(true)
    }
  })
})
