import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "..", "..")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

const LIST_PAGE = "src/app/(dashboard)/produksi/garansi/page.tsx"
const DETAIL_PAGE = "src/app/(dashboard)/produksi/garansi/[claimId]/page.tsx"
const CREATE_PAGE = "src/app/(dashboard)/produksi/garansi/tambah/page.tsx"
const CUSTOMER_VEHICLE_PAGE =
  "src/app/(dashboard)/master/pelanggan/[slug]/kendaraan/[vehicleSlug]/page.tsx"

const VIEW = "view_warranty_claims"
const CREATE = "create_warranty_claims"
const EDIT = "edit_warranty_claims"
const APPROVE = "approve_warranty_claims"

/**
 * Pengunci pemetaan izin halaman garansi.
 *
 * Server action tetap penegak akhir; tes ini mencegah gerbang tampilan
 * halaman tertukar — misalnya keputusan pejabat tanpa sengaja dibaca dari
 * izin edit, atau pembuatan klaim dari izin lihat.
 */
describe("pemetaan izin halaman garansi", () => {
  it("halaman daftar hanya melihat dengan view dan membuat dengan create", () => {
    const source = read(LIST_PAGE)

    expect(source).toContain(`requirePermission("${VIEW}")`)
    expect(source).toContain(`<CanCreate permission="${CREATE}">`)
    expect(source).not.toContain(`requirePermission("${CREATE}")`)
    expect(source).not.toContain(EDIT)
    expect(source).not.toContain(APPROVE)
  })

  it("halaman detail membedakan view, approve untuk keputusan, dan edit untuk transisi", () => {
    const source = read(DETAIL_PAGE)

    expect(source).toContain(`requirePermission("${VIEW}")`)
    expect(source).toContain(`hasPermission("${APPROVE}")`)
    expect(source).toContain(`hasPermission("${EDIT}")`)
    expect(source).toContain("const [canDecide, canTransition] = await Promise.all([")
    expect(source).toContain('canDecide={canDecide}')
    expect(source).toContain('canTransition={canTransition}')
    expect(source).not.toContain(CREATE)
  })

  it("halaman buat klaim hanya dibuka dengan create", () => {
    const source = read(CREATE_PAGE)

    expect(source).toContain(`requirePermission("${CREATE}")`)
    expect(source).not.toContain(VIEW)
    expect(source).not.toContain(EDIT)
    expect(source).not.toContain(APPROVE)
  })

  it("kartu garansi kendaraan hanya memakai view untuk tampil dan create untuk tombol klaim", () => {
    const source = read(CUSTOMER_VEHICLE_PAGE)

    expect(source).toContain(`hasPermission("${VIEW}")`)
    expect(source).toContain(`hasPermission("${CREATE}")`)
    expect(source).toContain("const canViewWarranty = await hasPermission")
    expect(source).toContain("const canCreateWarrantyClaim = await hasPermission")
    expect(source).not.toContain(EDIT)
    expect(source).not.toContain(APPROVE)
  })
})
