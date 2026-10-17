import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga sambungan halaman Kalender Kerja.
 *
 * Mengapa perlu: satu cacat nyata hanya bisa terlihat di sisi FORMULIR, bukan di
 * aksi. Checkbox hari kerja mengirim satu entri FormData per hari terpilih,
 * sementara `parseFormData` memetakan FormData ke objek dan hanya menyimpan nilai
 * TERAKHIR — sehingga jadwal Senin–Jumat akan tersimpan sebagai "Jumat" saja dan
 * perhitungan absensi membaca hari kerja yang salah. Perbaikannya ada di formulir
 * (menggabungkan hari lebih dulu), jadi yang diperiksa di sini adalah kontrak itu.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const PAGE = "src/app/(dashboard)/sdm/kalender-kerja/page.tsx"
const FORMS = "src/app/(dashboard)/sdm/kalender-kerja/_components/work-calendar-forms.tsx"
const NAV = "src/components/layout/navigation.ts"
const DESCRIPTIONS = "src/components/layout/nav-descriptions.ts"

describe("kalender kerja: halaman, formulir, dan navigasi tersambung", () => {
  it("halaman merender ketiga formulir dan ketiga aksi hapusnya", () => {
    const src = read(PAGE)
    for (const name of ["HolidayForm", "DepartmentHolidayForm", "WorkScheduleForm"]) {
      expect(src).toContain(`<${name}`)
    }
    for (const action of ["deleteHoliday", "deleteDepartmentHoliday", "deleteWorkSchedule"]) {
      expect(src).toContain(`action={${action}}`)
    }
    // Halaman tetap dijaga izin: hari libur & jadwal kerja adalah data SDM.
    expect(src).toMatch(/requireAnyPermission\(\[/)
  })

  it("formulir menggabungkan checkbox hari kerja menjadi SATU nilai sebelum memanggil aksi", () => {
    const src = read(FORMS)
    expect(
      src,
      "Tanpa penggabungan ini, `parseFormData` hanya menyimpan hari TERAKHIR yang " +
        "dicentang — jadwal Senin–Jumat tersimpan sebagai \"Jumat\" saja.",
    ).toContain('fd.set("workDays"')
    expect(src).toContain('fd.getAll("workDays")')

    // Ketiga formulir memanggil aksi buat DAN aksi ubah.
    for (const name of ["createHoliday", "updateHoliday", "createWorkSchedule", "updateWorkSchedule"]) {
      expect(src).toContain(name)
    }
  })

  it("halaman terdaftar di navigasi beserta deskripsinya", () => {
    const nav = read(NAV)
    expect(nav).toContain('href: "/sdm/kalender-kerja"')
    expect(nav).toMatch(/label: "Kalender Kerja".*permission: "view_work_schedules"/)
    expect(read(DESCRIPTIONS)).toContain('"/sdm/kalender-kerja"')
  })

  it("izin ubah jadwal kerja benar-benar ditegakkan aksinya", () => {
    const actions = read("src/actions/hrm.actions.ts")
    expect(actions).toMatch(/export async function updateWorkSchedule[\s\S]{0,120}requirePermission\("edit_work_schedules"\)/)
    expect(actions).toMatch(/export async function createWorkSchedule[\s\S]{0,120}requirePermission\("create_work_schedules"\)/)
  })
})
