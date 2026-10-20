import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga struktur rute Absensi.
 *
 * Daftar absensi pernah menyatu dengan formulir catat/ubah (formulir
 * inline + `?editAbsensi=`), dan filter tanggal/bulannya query string
 * yang bisa bertabrakan (`?tanggal=…&bulan=…`). Kontrak barunya: daftar
 * saja di `[[...segments]]` dengan filter tanggal/bulan sebagai pasangan
 * kunci/nilai di path, formulir di halaman tambah/ubah terpisah, dan
 * tautan lama diarahkan ke bentuk baru.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const LIST = "src/app/(dashboard)/sdm/absensi/[[...segments]]/page.tsx"
const CREATE = "src/app/(dashboard)/sdm/absensi/tambah/page.tsx"
const EDIT = "src/app/(dashboard)/sdm/absensi/[id]/ubah/page.tsx"
const TABLE = "src/app/(dashboard)/sdm/absensi/_components/attendance-table.tsx"
const FILTER = "src/app/(dashboard)/sdm/absensi/_components/attendance-filter-form.tsx"
const FORMS = "src/app/(dashboard)/sdm/absensi/_components/attendance-forms.tsx"

describe("absensi: daftar, formulir, dan URL terpisah rapi", () => {
  it("halaman daftar hanya merender tabel + filter, bukan formulir", () => {
    const src = read(LIST)
    expect(src).toContain("<AttendanceTable")
    expect(src).toContain("<AttendanceFilterForm")
    expect(src).not.toContain("<AttendanceForm")
    expect(src).toContain('href="/sdm/absensi/tambah"')
  })

  it("filter tanggal/bulan dibaca dari segmen path, bukan query string", () => {
    const src = read(LIST)
    expect(src).toContain("parseAttendanceSegments")
    expect(src).toContain('key === "tanggal"')
    expect(src).toContain('key === "bulan"')
    const filter = read(FILTER)
    expect(filter).toContain("/tanggal/${tanggalValue}")
    expect(filter).toContain("/bulan/${bulanValue}")
  })

  it("tautan lama ?tanggal=/?bulan=/?editAbsensi= diarahkan ke bentuk baru", () => {
    const src = read(LIST)
    expect(src).toContain("params.editAbsensi")
    expect(src).toContain("/ubah`")
    expect(src).toContain("/sdm/absensi/tanggal/${params.tanggal}")
    expect(src).toContain("/sdm/absensi/bulan/${params.bulan}")
  })

  it("halaman tambah & ubah merender formulir dengan izin aksinya", () => {
    const create = read(CREATE)
    expect(create).toContain('requirePermission("create_attendance")')
    expect(create).toContain("<AttendanceForm")
    const edit = read(EDIT)
    expect(edit).toContain('requirePermission("edit_attendance")')
    expect(edit).toContain("<AttendanceForm")
    expect(edit).toContain("notFound()")
  })

  it("formulir memakai struktur FormCard/FormSection/FormActions", () => {
    for (const page of [CREATE, EDIT]) {
      expect(read(page)).toContain("<FormCard>")
    }
    const form = read(FORMS)
    expect(form).toContain("<FormSection")
    expect(form).toContain("<FormActions>")
  })

  it("menu ubah tabel menuju halaman ubah, bukan query editAbsensi", () => {
    const src = read(TABLE)
    expect(src).toContain("/ubah`")
    expect(src).not.toContain("editAbsensi=")
  })
})
