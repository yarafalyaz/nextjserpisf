import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga sambungan modul Grup Aset.
 *
 * Mengapa perlu: aksi server tidak bisa melihat cacat sisi halaman. Kalau halaman
 * berhenti meneruskan izin, atau pilihan "Grup Aset" di form aset berhenti ada,
 * aksinya tetap hijau dan pengguna hanya melihat daftar kosong tanpa satu pun tes
 * memerah — pola yang sama sudah terbukti pada checkbox hari kerja dan pusat laba.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const PAGE = "src/app/(dashboard)/aset/grup/page.tsx"
const TAMBAH = "src/app/(dashboard)/aset/grup/tambah/page.tsx"
const UBAH = "src/app/(dashboard)/aset/grup/[slug]/ubah/page.tsx"
const TABLE = "src/app/(dashboard)/aset/grup/_components/asset-group-table.tsx"
const FORM = "src/components/forms/asset-group-form.tsx"

describe("grup aset: halaman, formulir, dan izin tersambung", () => {
  it("daftar memakai izin view_asset_groups dan menerjemahkan ?cari=", () => {
    const src = read(PAGE)
    expect(src).toContain('requirePermission("view_asset_groups")')
    // Tanpa terjemahan ini, kotak cari mode server tidak menyaring apa pun.
    expect(src).toContain("name: { contains: cari }")
    // Hitungan halaman memakai where yang SAMA, kalau tidak jumlah halaman meleset.
    expect(src).toMatch(/prisma\.assetGroup\.count\(\{ where \}\)/)
  })

  it("halaman tambah dan ubah memakai izin masing-masing", () => {
    expect(read(TAMBAH)).toContain('requirePermission("create_asset_groups")')
    expect(read(UBAH)).toContain('requirePermission("edit_asset_groups")')
  })

  it("tabel dan formulir memanggil aksi boleh-ubah lewat jalur yang benar", () => {
    expect(read(TABLE)).toContain("deleteAssetGroup")
    expect(read(TABLE)).toContain('deletePermission="delete_asset_groups"')
    const form = read(FORM)
    expect(form).toContain("createAssetGroup")
    expect(form).toContain("updateAssetGroup")
  })

  it("halaman terdaftar di navigasi dan form aset menyediakan pilihan grup", () => {
    const nav = read("src/components/layout/navigation.ts")
    expect(nav).toContain('href: "/aset/grup"')
    expect(nav).toMatch(/label: "Grup Aset".*permission: "view_asset_groups"/)

    // Catatan: `nav-descriptions.ts` TIDAK punya entri `"/aset/*"` sama sekali —
    // halaman aset lain (kategori, merek) juga tidak. Jadi menuntut entri di sini
    // adalah asersi yang salah, bukan celah; yang dijaga cukup entri navigasinya.

    const assetForm = read("src/app/(dashboard)/aset/tambah/form.tsx")
    expect(assetForm).toContain('name="groupId"')
    expect(assetForm).toContain("groups.map")
  })

  it("penghapusan grup menolak bila masih dipakai aset", () => {
    // Relasi Asset.groupId opsional: tanpa penjagaan ini Prisma melepas asetnya
    // diam-diam (SetNull) dan pengelompokan hilang tanpa pesan.
    const src = read("src/actions/asset.actions.ts")
    expect(src).toMatch(/deleteAssetGroup[\s\S]{0,600}prisma\.asset\.count\(\{ where: \{ groupId: id \} \}\)/)
    expect(src).toMatch(/deleteAssetGroup[\s\S]{0,900}masih dipakai/)
  })
})
