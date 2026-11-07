import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga: tombol "buat dokumen turunan" di halaman DETAIL harus digerbangi
 * izin CREATE halaman tujuannya.
 *
 * Halaman tambah (`.../tambah/...`) menegakkan izinnya dengan
 * `requirePermission(...)` lalu `redirect("/")` saat gagal (lihat
 * src/lib/auth/permissions.ts). Jadi tautan tanpa gerbang bukan sekadar
 * kosmetik: peran lihat-saja melihat "+ Buat Penerimaan", mengklik, dan
 * terpental diam ke dasbor tanpa pesan apa pun — persis pola yang sudah
 * ditutup untuk tombol Ubah/Hapus di putaran 220/221.
 *
 * `button-permission-gating.test.ts` tidak menangkap kelas ini karena ia
 * memeriksa level BERKAS: satu `hasPermission(...)` di mana saja sudah
 * memuaskan penjaga, padahal halaman detail punya banyak tombol dengan izin
 * berbeda-beda. Penjaga ini memeriksa per tautan.
 *
 * Daftar ini bukan pengecualian — ia daftar KASUS. Setiap entri menyebut
 * halaman, potongan href yang khas, dan izin create yang dituntut halaman
 * tujuan. Kalau tautan hilang, `expect(src).toContain(href)` memerah; kalau
 * gerbangnya dicabut, regex `CanCreate permission="…"` memerah.
 */

const DASHBOARD = join(process.cwd(), "src/app/(dashboard)")

interface Case {
  /** Halaman detail yang merender tautan. */
  page: string
  /** Potongan `href` yang khas untuk tautan ini (cukup unik di berkasnya). */
  href: string
  /** Izin yang dituntut halaman tambah tujuan. */
  permission: string
  /**
   * Pola gerbang alternatif yang juga sah: boolean `hasPermission` dari server
   * yang dibaca sebagai `{canXxx && (...)}` (dipakai putaran 220/221 dan
   * halaman yang tombolnya dipakai dua tujuan sekaligus). Bila diisi, tautan
   * dianggap bergerbang bila kondisi ini muncul tepat sebelum `href`.
   */
  altCondition?: RegExp
}

const CASES: Case[] = [
  // Penawaran → uang muka & pesanan penjualan
  {
    page: "penjualan/penawaran/[slug]/page.tsx",
    href: "/penjualan/uang-muka/tambah/penawaran/",
    permission: "create_down_payments",
  },
  {
    page: "penjualan/penawaran/[slug]/page.tsx",
    href: "/penjualan/pesanan/tambah/penawaran/",
    permission: "create_sales_orders",
    altCondition: /\{canCreateSalesOrder\s*&&\s*\(/,
  },
  // Pesanan penjualan → uang muka, surat jalan, faktur
  {
    page: "penjualan/pesanan/[slug]/page.tsx",
    href: "/penjualan/uang-muka/tambah/pesanan/",
    permission: "create_down_payments",
  },
  {
    page: "penjualan/pesanan/[slug]/page.tsx",
    href: "/penjualan/surat-jalan/tambah/pesanan/",
    permission: "create_delivery_orders",
  },
  {
    page: "penjualan/pesanan/[slug]/page.tsx",
    href: "/penjualan/faktur/tambah/pesanan/",
    permission: "create_sales_invoices",
  },
  // Permintaan pembelian → pesanan pembelian
  {
    page: "pembelian/permintaan/[slug]/page.tsx",
    href: "/pembelian/pesanan/tambah/pr/",
    permission: "create_purchase_orders",
  },
  // Pesanan pembelian → tagihan, penerimaan, retur
  {
    page: "pembelian/pesanan/[slug]/page.tsx",
    href: "/pembelian/tagihan/tambah/po/",
    permission: "create_vendor_bills",
  },
  {
    page: "pembelian/pesanan/[slug]/page.tsx",
    href: "/pembelian/penerimaan/tambah/po/",
    permission: "create_goods_receipts",
  },
  {
    page: "pembelian/pesanan/[slug]/page.tsx",
    href: "/pembelian/retur/tambah/po/",
    permission: "create_purchase_returns",
  },
]

/** Halaman tambah tujuan menuntut izin yang sama dengan yang diharapkan kasus. */
const TARGET_PAGES: Array<[string, string]> = [
  ["penjualan/uang-muka/tambah", "create_down_payments"],
  ["penjualan/pesanan/tambah", "create_sales_orders"],
  ["penjualan/surat-jalan/tambah", "create_delivery_orders"],
  ["penjualan/faktur/tambah", "create_sales_invoices"],
  ["pembelian/pesanan/tambah", "create_purchase_orders"],
  ["pembelian/tagihan/tambah", "create_vendor_bills"],
  ["pembelian/penerimaan/tambah", "create_goods_receipts"],
  ["pembelian/retur/tambah", "create_purchase_returns"],
]

function read(rel: string): string {
  return readFileSync(join(DASHBOARD, rel), "utf8")
}

/**
 * Apakah tautan `href` berada di dalam `<CanCreate permission="X">` — atau,
 * bila `alt` diberikan, di dalam kondisi boolean `hasPermission` yang setara?
 *
 * Dipindai ke belakang dari posisi `href` menghitung kedalaman tag: setiap
 * `<CanCreate` menaikkan hitungan, setiap `</CanCreate>` menurunkannya. Bila
 * kita keluar dari berkas tanpa menemukan penutup, tautan dianggap TIDAK
 * bergerbang (fail-closed untuk penjaga).
 */
function gatedBy(src: string, href: string, permission: string, alt?: RegExp): boolean {
  const at = src.indexOf(href)
  if (at === -1) return false

  // Jendela sebelum tautan: cukup untuk memuat `{canXxx && (` pembungkus.
  if (alt) {
    const window = src.slice(Math.max(0, at - 400), at)
    if (alt.test(window)) return true
  }

  let depth = 0
  let i = at
  while (i >= 0) {
    const open = src.lastIndexOf("<CanCreate", i)
    const close = src.lastIndexOf("</CanCreate>", i)
    if (open === -1) return false
    if (close > open) {
      // Tutup terdekat sebelum posisi: kita sedang di luar blok.
      if (depth === 0) return false
      depth -= 1
      i = close - 1
      continue
    }
    if (depth === 0) {
      const tag = src.slice(open, src.indexOf(">", open) + 1)
      return tag.includes(`permission="${permission}"`)
    }
    depth += 1
    i = open - 1
  }
  return false
}

describe("tautan buat-dokumen di halaman detail digerbangi izin create", () => {
  it("menemukan cukup banyak kasus untuk tidak vakum", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(9)
  })

  it.each(CASES)("$page: tautan $href masih ada", ({ page, href }) => {
    expect(read(page), `${page} tidak lagi memuat tautan ${href}`).toContain(href)
  })

  it.each(CASES)(
    "$page: $href digerbangi CanCreate permission=$permission",
    ({ page, href, permission, altCondition }) => {
      const src = read(page)
      expect(
        gatedBy(src, href, permission, altCondition),
        `${page}: tautan ${href} tidak berada di dalam <CanCreate permission="${permission}">. ` +
          `Halaman tambah tujuan menuntut izin itu lalu redirect("/") — peran lihat-saja ` +
          `mengklik tautan dan terpental diam ke dasbor.`,
      ).toBe(true)
    },
  )

  it.each(TARGET_PAGES)(
    "halaman tambah %s benar-benar menuntut %s",
    (dir, permission) => {
      // Halaman tambah bisa `page.tsx` polos atau `[[...segments]]/page.tsx`.
      const candidates = [
        join(DASHBOARD, dir, "page.tsx"),
        join(DASHBOARD, dir, "[[...segments]]", "page.tsx"),
      ]
      const found = candidates.find((p) => {
        try {
          readFileSync(p)
          return true
        } catch {
          return false
        }
      })
      expect(found, `halaman tambah ${dir} tidak ditemukan`).toBeTruthy()
      expect(readFileSync(found!, "utf8")).toContain(`requirePermission("${permission}")`)
    },
  )
})
