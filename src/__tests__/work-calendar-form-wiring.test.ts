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
  it("halaman daftar merender ketiga aksi hapus dan tautan tambah/ubah per entitas", () => {
    const src = read(PAGE)
    for (const action of ["deleteHoliday", "deleteDepartmentHoliday", "deleteWorkSchedule"]) {
      expect(src).toContain(`action={${action}}`)
    }
    // Formulir tidak lagi inline: daftar hanya menaut ke halaman formulirnya.
    for (const href of [
      "/sdm/kalender-kerja/libur/tambah",
      "/sdm/kalender-kerja/libur-departemen/tambah",
      "/sdm/kalender-kerja/jadwal/tambah",
      "/ubah`",
    ]) {
      expect(src).toContain(href)
    }
    expect(src).not.toContain("?editHoliday=${")
    expect(src).not.toContain("?editDeptHoliday=${")
    expect(src).not.toContain("?editSchedule=${")
    // Halaman tetap dijaga izin: hari libur & jadwal kerja adalah data SDM.
    expect(src).toMatch(/requireAnyPermission\(\[/)
  })

  it("ketiga formulir tinggal di halaman tambah/ubah dengan izin aksinya", () => {
    const cases: Array<{ page: string; form: string; permission: string }> = [
      { page: "libur/tambah/page.tsx", form: "HolidayForm", permission: 'requirePermission("create_holidays")' },
      { page: "libur/[id]/ubah/page.tsx", form: "HolidayForm", permission: 'requirePermission("edit_holidays")' },
      { page: "libur-departemen/tambah/page.tsx", form: "DepartmentHolidayForm", permission: 'requirePermission("create_holidays")' },
      { page: "libur-departemen/[id]/ubah/page.tsx", form: "DepartmentHolidayForm", permission: 'requirePermission("edit_holidays")' },
      { page: "jadwal/tambah/page.tsx", form: "WorkScheduleForm", permission: 'requirePermission("create_work_schedules")' },
      { page: "jadwal/[id]/ubah/page.tsx", form: "WorkScheduleForm", permission: 'requirePermission("edit_work_schedules")' },
    ]
    for (const { page, form, permission } of cases) {
      const src = read(`src/app/(dashboard)/sdm/kalender-kerja/${page}`)
      expect(src).toContain(`<${form}`)
      expect(src).toContain(permission)
    }
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

  it("formulir mengirim isActive eksplisit (jadwal nonaktif tidak boleh hidup lagi saat diubah)", () => {
    const src = read(FORMS)
    expect(
      src,
      "Checkbox `isActive` native tidak mengirim field saat tidak dicentang, dan " +
        "`updateWorkSchedule` membaca absen sebagai `?? true` — tanpa `fd.set` eksplisit, " +
        "jadwal kerja nonaktif tidak akan pernah bisa dinonaktifkan lewat UI dan akan " +
        "tetap dibaca layanan absensi/cuti yang hanya mengambil `isActive: true`.",
    ).toContain('fd.set("isActive"')
  })

  it("izin ubah jadwal kerja benar-benar ditegakkan aksinya", () => {
    const actions = read("src/actions/hrm.actions.ts")
    expect(actions).toMatch(/export async function updateWorkSchedule[\s\S]{0,120}requirePermission\("edit_work_schedules"\)/)
    expect(actions).toMatch(/export async function createWorkSchedule[\s\S]{0,120}requirePermission\("create_work_schedules"\)/)
  })
})
