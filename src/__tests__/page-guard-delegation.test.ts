import { describe, it, expect } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Penjaga delegasi guard halaman.
 *
 * Kebanyakan halaman dashboard memanggil `requirePermission()` sendiri,
 * tetapi sebagian mendelegasikan penjagaannya: me-render ulang renderer
 * halaman lain, memakai loader bersama, hanya me-redirect, atau hanya
 * menampilkan formulir yang aksinya dijaga di lapisan action. Tanpa peta
 * ini, refactor yang mencabut guard dari target delegasi akan membuat
 * halaman tampil tanpa izin dan tidak ada test yang memerah.
 *
 * Peta di bawah diperiksa DUA ARAH (pola ratchet repo ini): halaman tanpa
 * guard langsung yang tidak terdaftar = gagal; entri peta yang halamannya
 * sudah menjaga sendiri / sudah hilang = gagal (peta wajib dirapikan).
 */

const ROOT = join(__dirname, "..", "..")
const APP = join(ROOT, "src/app/(dashboard)")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const GUARD_CALL = /requirePermission\(|requireAnyPermission\(|requireRole\(|requireAuth\(/

function pageFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...pageFiles(full))
    else if (entry === "page.tsx") out.push(relative(APP, full))
  }
  return out
}

type Delegation =
  | { kind: "renderer"; call: string; target: string }
  | { kind: "loader"; call: string; target: string }
  | { kind: "redirect" }
  | { kind: "form-action" }
  | { kind: "client-action"; action: string; file: string }

/** Halaman tanpa guard langsung → ke mana penjagaannya didelegasikan. */
const DELEGATED: Record<string, Delegation> = {
  "master/barang/stokmenipis/page.tsx": {
    kind: "renderer",
    call: "renderItemsPage",
    target: "src/app/(dashboard)/master/barang/page.tsx",
  },
  "penjualan/faktur/jatuh-tempo/page.tsx": {
    kind: "renderer",
    call: "renderInvoicesPage",
    target: "src/app/(dashboard)/penjualan/faktur/page.tsx",
  },
  "pengaturan/persetujuan/menunggu/page.tsx": {
    kind: "renderer",
    call: "renderApprovalsPage",
    target: "src/app/(dashboard)/pengaturan/persetujuan/page.tsx",
  },
  "penjualan/antrean-penagihan/page.tsx": {
    kind: "loader",
    call: "getCollectionQueue",
    target: "src/lib/reports/collection-queue-data.ts",
  },
  "keuangan/antrean-reimbursement/page.tsx": {
    kind: "loader",
    call: "getReimbursementQueue",
    target: "src/lib/reports/reimbursement-queue-data.ts",
  },
  "laporan/pph-21/[[...segments]]/page.tsx": {
    kind: "loader",
    call: "loadPayrollPageContext",
    target: "src/lib/reports/payroll-page-context.ts",
  },
  "laporan/gaji-karyawan/[[...segments]]/page.tsx": {
    kind: "loader",
    call: "loadPayrollPageContext",
    target: "src/lib/reports/payroll-page-context.ts",
  },
  "laporan/porsi-gaji/[[...segments]]/page.tsx": {
    kind: "loader",
    call: "loadPayrollPageContext",
    target: "src/lib/reports/payroll-page-context.ts",
  },
  "laporan/laba-rugi-terealisasi/[[...segments]]/page.tsx": {
    kind: "loader",
    call: "IncomeStatementPage",
    target: "src/components/reports/income-statement-page.tsx",
  },
  "laporan/laba-rugi-tidak-terealisasi/[[...segments]]/page.tsx": {
    kind: "loader",
    call: "IncomeStatementPage",
    target: "src/components/reports/income-statement-page.tsx",
  },
  "kendaraan/model/page.tsx": { kind: "redirect" },
  "inventaris/scan/page.tsx": {
    kind: "client-action",
    action: "lookupItemByScan",
    file: "src/actions/master.actions.ts",
  },
  "master/pajak/tambah/page.tsx": { kind: "form-action" },
  "master/bank/tambah/page.tsx": { kind: "form-action" },
  "master/grup-barang/tambah/page.tsx": { kind: "form-action" },
  "master/syarat-pembayaran/tambah/page.tsx": { kind: "form-action" },
  "master/barcode/tambah/page.tsx": { kind: "form-action" },
  "master/kategori-pengeluaran/tambah/page.tsx": { kind: "form-action" },
  "master/kategori-barang/tambah/page.tsx": { kind: "form-action" },
}

describe("halaman dashboard: guard langsung atau delegasi terdaftar", () => {
  const pages = pageFiles(APP)
  const unguarded = pages.filter((p) => !GUARD_CALL.test(read(join("src/app/(dashboard)", p))))

  it("setiap halaman tanpa guard langsung terdaftar delegasinya", () => {
    const unregistered = unguarded.filter((p) => !(p in DELEGATED))
    expect(
      unregistered,
      `Halaman tanpa requirePermission langsung dan tanpa delegasi terdaftar:\n${unregistered.join("\n")}`,
    ).toEqual([])
  })

  it("peta delegasi tidak menyimpan entri usang", () => {
    const stale = Object.keys(DELEGATED).filter((p) => !unguarded.includes(p))
    expect(
      stale,
      `Entri delegasi yang halamannya sudah menjaga sendiri/sudah hilang:\n${stale.join("\n")}`,
    ).toEqual([])
  })

  it("target delegasi benar-benar menjaga", () => {
    for (const [page, delegation] of Object.entries(DELEGATED)) {
      const src = read(join("src/app/(dashboard)", page))
      if (delegation.kind === "renderer" || delegation.kind === "loader") {
        expect(src, `${page} harus memanggil ${delegation.call}`).toContain(delegation.call)
        expect(
          GUARD_CALL.test(read(delegation.target)),
          `${delegation.target} (target ${page}) harus memanggil require*`,
        ).toBe(true)
      } else if (delegation.kind === "redirect") {
        expect(src, `${page} hanya boleh redirect`).toContain("redirect(")
        expect(src, `${page} tidak boleh membaca data`).not.toContain("prisma.")
      } else if (delegation.kind === "form-action") {
        // Formulirnya memanggil server action; action dijaga oleh
        // action-permission-guard. Formulir bisa inline di halaman atau
        // komponen saudara (`./form`), jadi keduanya diperiksa.
        const siblingForms = [...src.matchAll(/from "(\.\/[\w-]+)"/g)]
          .map((m) => join(ROOT, "src/app/(dashboard)", page, "..", `${m[1]}.tsx`))
          .filter((p) => existsSync(p))
          .map((p) => readFileSync(p, "utf8"))
        expect(
          [src, ...siblingForms].some((s) => /from "@\/actions\//.test(s)),
          `${page} (atau form saudaranya) harus mengimpor server action`,
        ).toBe(true)
      } else if (delegation.kind === "client-action") {
        expect(src, `${page} harus memanggil ${delegation.action}`).toContain(delegation.action)
        const actionSrc = read(delegation.file)
        const fnAt = actionSrc.indexOf(`function ${delegation.action}`)
        expect(fnAt, `${delegation.action} harus ada di ${delegation.file}`).toBeGreaterThan(-1)
        expect(
          actionSrc.slice(fnAt, fnAt + 400),
          `${delegation.action} harus menjaga izinnya sendiri`,
        ).toMatch(GUARD_CALL)
      }
    }
  })
})
