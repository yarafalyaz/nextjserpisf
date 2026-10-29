import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga sambungan halaman Roster Karyawan: halaman `/sdm/roster` adalah
 * jalur tulis pertama EmployeeRoster — guard ini memerah bila form/tombol
 * terlepas dari aksinya, nav hilang, atau izin menyimpang dari keluarga
 * absensi existing (tanpa key izin baru).
 */
const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const PAGE = "src/app/(dashboard)/sdm/roster/page.tsx"
const FORMS = "src/app/(dashboard)/sdm/roster/_components/roster-forms.tsx"

describe("roster: halaman, formulir, dan navigasi tersambung", () => {
  it("halaman membaca loader roster + tombol hapus draft + gerbang izin absensi", () => {
    const src = read(PAGE)
    expect(src).toContain("loadEmployeeRoster")
    expect(src).toContain("action={deleteEmployeeRoster}")
    expect(src).toContain("RosterDecisionButtons")
    expect(src).toMatch(/requireAnyPermission\(\[\s*"view_attendance"/)
  })

  it("formulir memanggil create, keputusan memanggil approve/reject", () => {
    const src = read(FORMS)
    expect(src).toContain("createEmployeeRoster(")
    expect(src).toContain("approveEmployeeRoster")
    expect(src).toContain("rejectEmployeeRoster")
    for (const type of ["cuti", "sakit", "izin", "tugas_luar", "libur_ganti"]) {
      expect(src).toMatch(new RegExp(`\\b${type}\\b`))
    }
    // Daftar jenis kanonis di skema validasi, dipakai dropdown formulir.
    expect(read("src/lib/validations/hrm.schemas.ts")).toContain("ROSTER_TYPES")
  })

  it("halaman terdaftar di navigasi beserta deskripsinya", () => {
    expect(read("src/components/layout/navigation.ts")).toContain('href: "/sdm/roster"')
    expect(read("src/components/layout/nav-descriptions.ts")).toContain('"/sdm/roster"')
  })

  it("kedua handler formulir membungkus await aksi dengan try/catch + showError", () => {
    const src = read(FORMS)
    // Server action yang melempar (redirect/error) tidak boleh jadi unhandled
    // rejection senyap di client: tiap handler wajib tangkap + tampilkan.
    expect(src).toContain('try {\n        const res = await createEmployeeRoster(new FormData(form))')
    expect(src).toContain('try {\n        const res = await action(id)')
    expect(src.match(/catch \{\s*\n\s*showError\(/g)).toHaveLength(2)
  })

  it("aksi roster menegakkan izin keluarga absensi existing", () => {
    const actions = read("src/actions/hrm.actions.ts")
    expect(actions).toMatch(/export async function createEmployeeRoster[\s\S]{0,200}requirePermission\("create_attendance"\)/)
    expect(actions).toMatch(/export async function approveEmployeeRoster[\s\S]{0,200}requirePermission\("edit_attendance"\)/)
    expect(actions).toMatch(/export async function rejectEmployeeRoster[\s\S]{0,200}requirePermission\("edit_attendance"\)/)
    expect(actions).toMatch(/export async function deleteEmployeeRoster[\s\S]{0,200}requirePermission\("manage_attendance"\)/)
  })
})
