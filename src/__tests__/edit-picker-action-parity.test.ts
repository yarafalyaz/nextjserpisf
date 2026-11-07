import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  PAYABLE_VENDOR_BILL_STATUSES,
  RECEIVABLE_PURCHASE_ORDER_STATUSES,
  TERMINAL_WORK_ORDER_STATUSES,
  TRANSFERABLE_ASSET_STATUSES,
  UNPAYABLE_SALES_INVOICE_STATUSES,
} from "@/lib/constants/status"

/**
 * Penjaga: picker di halaman form dan penjaga di server action harus membaca
 * himpunan status yang SAMA.
 *
 * Kelas bug ini halus: picker menawarkan nilai yang action-nya SELALU tolak,
 * jadi form tampak sah, operator memilih, lalu menyimpan gagal dengan pesan
 * yang tidak menjelaskan bahwa pilihannya memang mustahil. Empat pasangan
 * ditemukan pada putaran 225 — semuanya di halaman UBAH, sementara halaman
 * TAMBAH pasangannya sudah benar:
 *
 *   - `penjualan/pembayaran/[slug]/ubah` memakai `not: "paid"` sehingga faktur
 *     draft/approved/cancelled ikut ditawarkan;
 *   - `aset/transfer/[slug]/ubah` memuat SEMUA aset (termasuk disposed);
 *   - `pembelian/pembayaran-vendor/[slug]/ubah` memakai `notIn [paid,
 *     cancelled]` sehingga tagihan konsep ikut ditawarkan;
 *   - `pembelian/penerimaan/[slug]/ubah` menyertakan `received` pada PO.
 *
 * Perbaikannya bukan sekadar menyamakan literal: kedua sisi kini mengimpor
 * konstanta bersama, dan penjaga ini menegaskan IMPOR itu ada di kedua sisi —
 * sehingga penyimpangan berikutnya tidak bisa ditulis tanpa memerah.
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8")
}

interface Pair {
  /** Nama konstanta bersama. */
  constant: string
  /** Berkas picker (halaman form) yang harus mengimpornya. */
  pickers: string[]
  /** Berkas action yang harus mengimpornya. */
  actions: string[]
}

const PAIRS: Pair[] = [
  {
    constant: "UNPAYABLE_SALES_INVOICE_STATUSES",
    pickers: ["src/app/(dashboard)/penjualan/pembayaran/[slug]/ubah/page.tsx"],
    actions: ["src/actions/sales.actions.ts"],
  },
  {
    constant: "TRANSFERABLE_ASSET_STATUSES",
    pickers: [
      "src/app/(dashboard)/aset/transfer/[slug]/ubah/page.tsx",
      "src/app/(dashboard)/aset/transfer/tambah/page.tsx",
    ],
    actions: ["src/actions/asset.actions.ts"],
  },
  {
    constant: "PAYABLE_VENDOR_BILL_STATUSES",
    pickers: ["src/app/(dashboard)/pembelian/pembayaran-vendor/[slug]/ubah/page.tsx"],
    actions: ["src/actions/purchase.actions.ts"],
  },
  {
    constant: "RECEIVABLE_PURCHASE_ORDER_STATUSES",
    pickers: ["src/app/(dashboard)/pembelian/penerimaan/[slug]/ubah/page.tsx"],
    actions: ["src/actions/purchase.actions.ts"],
  },
  {
    constant: "TERMINAL_WORK_ORDER_STATUSES",
    pickers: [
      "src/app/(dashboard)/inventaris/permintaan-gudang/tambah/page.tsx",
      "src/app/(dashboard)/inventaris/permintaan-gudang/[slug]/ubah/page.tsx",
      "src/app/(dashboard)/produksi/production-orders/tambah/[[...segments]]/page.tsx",
      "src/app/(dashboard)/produksi/production-orders/[slug]/ubah/page.tsx",
    ],
    actions: ["src/lib/services/material-request.service.ts", "src/actions/manufacturing.actions.ts"],
  },
]

describe("picker halaman form vs penjaga server action (putaran 225)", () => {
  it("konstanta bersama berisi status yang diharapkan", () => {
    expect([...UNPAYABLE_SALES_INVOICE_STATUSES]).toEqual(["draft", "approved", "cancelled"])
    expect([...TRANSFERABLE_ASSET_STATUSES]).toEqual(["active"])
    expect([...PAYABLE_VENDOR_BILL_STATUSES]).toEqual(["posted", "partial"])
    expect([...RECEIVABLE_PURCHASE_ORDER_STATUSES]).toEqual([
      "approved",
      "ordered",
      "partial_received",
    ])
    expect([...TERMINAL_WORK_ORDER_STATUSES]).toEqual(["completed", "cancelled", "closed"])
  })

  for (const pair of PAIRS) {
    it(`${pair.constant}: setiap picker dan action mengimpornya`, () => {
      for (const file of [...pair.pickers, ...pair.actions]) {
        const src = read(file)
        expect(
          src.includes(pair.constant),
          `${file} tidak menyebut ${pair.constant} — picker dan action bisa menyimpang lagi`,
        ).toBe(true)
      }
    })
  }

  it("picker memakai daftar itu di klausa where, bukan sekadar mengimpornya", () => {
    for (const pair of PAIRS) {
      for (const file of pair.pickers) {
        const src = read(file)
        const used = new RegExp(
          `(notIn|in):\\s*\\[\\.\\.\\.${pair.constant}\\]|notIn:\\s*${pair.constant}`,
        )
        expect(used.test(src), `${file}: ${pair.constant} diimpor tetapi tidak dipakai di where`).toBe(
          true,
        )
      }
    }
  })

  it("action menilai status dengan daftar yang sama, bukan literal terpisah", () => {
    const checks: Array<[string, string, RegExp]> = [
      [
        "src/actions/sales.actions.ts",
        "UNPAYABLE_SALES_INVOICE_STATUSES",
        /UNPAYABLE_SALES_INVOICE_STATUSES as readonly string\[\]\)\.includes\(invoice\.status\)/,
      ],
      [
        "src/actions/asset.actions.ts",
        "TRANSFERABLE_ASSET_STATUSES",
        /TRANSFERABLE_ASSET_STATUSES as readonly string\[\]\)\.includes\(/,
      ],
      [
        "src/actions/purchase.actions.ts",
        "PAYABLE_VENDOR_BILL_STATUSES",
        /PAYABLE_VENDOR_BILL_STATUSES as readonly string\[\]\)\.includes\(target\.status\)/,
      ],
      [
        "src/actions/purchase.actions.ts",
        "RECEIVABLE_PURCHASE_ORDER_STATUSES",
        /RECEIVABLE_PURCHASE_ORDER_STATUSES as readonly string\[\]\)\.includes\(/,
      ],
    ]
    for (const [file, constant, pattern] of checks) {
      expect(pattern.test(read(file)), `${file} tidak menilai ${constant} lewat includes`).toBe(true)
    }
  })

  it("halaman ubah mempertahankan rekaman yang sudah tertaut walau di luar daftar", () => {
    // Menyaring picker tanpa fallback akan mengosongkan Combobox untuk dokumen
    // yang tertaut ke rekaman yang sejak itu keluar dari daftar (mis. faktur
    // menjadi `paid` karena pembayaran ini sendiri) — menyimpan ulang lalu
    // menghapus tautannya diam-diam.
    const cases: Array<[string, RegExp]> = [
      ["src/app/(dashboard)/penjualan/pembayaran/[slug]/ubah/page.tsx", /linkedInvoice/],
      ["src/app/(dashboard)/aset/transfer/[slug]/ubah/page.tsx", /linkedAsset/],
      [
        "src/app/(dashboard)/pembelian/pembayaran-vendor/[slug]/ubah/page.tsx",
        /linkedBill/,
      ],
      [
        "src/app/(dashboard)/pembelian/penerimaan/[slug]/ubah/page.tsx",
        /linkedPurchaseOrder/,
      ],
      [
        "src/app/(dashboard)/produksi/production-orders/[slug]/ubah/page.tsx",
        /linkedWorkOrder/,
      ],
      [
        "src/app/(dashboard)/inventaris/permintaan-gudang/[slug]/ubah/page.tsx",
        /linkedWorkOrder/,
      ],
      // Putaran 227: vendor/pelanggan yang sudah tertaut pada dokumen draft.
      ["src/app/(dashboard)/pembelian/tagihan/[slug]/ubah/page.tsx", /linkedVendor/],
      ["src/app/(dashboard)/pembelian/pesanan/[slug]/ubah/page.tsx", /linkedVendor/],
      [
        "src/app/(dashboard)/pembelian/pembayaran-vendor/[slug]/ubah/page.tsx",
        /linkedVendor/,
      ],
      ["src/app/(dashboard)/penjualan/pesanan/[slug]/ubah/page.tsx", /linkedCustomer/],
    ]
    for (const [file, pattern] of cases) {
      expect(pattern.test(read(file)), `${file}: fallback rekaman tertaut hilang`).toBe(true)
    }
  })

  it("picker vendor/pelanggan di halaman ubah tidak menawarkan rekaman nonaktif (putaran 227)", () => {
    // Action hanya menilai liveness saat vendor/pelanggan BERPINDAH, jadi
    // menawarkan yang nonaktif berarti form menawarkan pilihan yang pasti
    // ditolak tepat ketika operator memilihnya.
    //
    // Regex menempel pada pemanggilan delegate-nya: halaman ini juga memuat
    // picker barang (`isActive: true, deletedAt: null`) yang akan memuaskan
    // pemeriksaan longgar dan menyembunyikan regresi pada picker vendor.
    const cases: Array<[string, string]> = [
      ["src/app/(dashboard)/pembelian/tagihan/[slug]/ubah/page.tsx", "vendor"],
      ["src/app/(dashboard)/pembelian/pesanan/[slug]/ubah/page.tsx", "vendor"],
      ["src/app/(dashboard)/pembelian/pembayaran-vendor/[slug]/ubah/page.tsx", "vendor"],
      ["src/app/(dashboard)/penjualan/pesanan/[slug]/ubah/page.tsx", "customer"],
    ]
    for (const [file, model] of cases) {
      const src = read(file)
      const filtered = new RegExp(
        `prisma\\.${model}\\.findMany\\(\\{\\s*\\n?\\s*where:\\s*\\{\\s*isActive:\\s*true,\\s*deletedAt:\\s*null\\s*\\}`,
      )
      expect(
        filtered.test(src),
        `${file}: prisma.${model}.findMany masih memuat rekaman nonaktif/terhapus`,
      ).toBe(true)
      expect(
        /vendorsRaw|customersRaw/.test(src),
        `${file}: daftar mentah hilang — fallback rekaman tertaut butuh daftar tersaring`,
      ).toBe(true)
    }
  })

  it("konstanta dipakai di action dan picker, bukan hanya di berkas tes ini", () => {
    // Ratchet: kalau seseorang memindahkan definisi kembali menjadi literal di
    // salah satu sisi, impor di berkas produksi akan hilang dan tes di atas
    // memerah — pemeriksaan ini memastikan daftar PAIRS tidak vakum.
    const touched = new Set<string>()
    for (const pair of PAIRS) {
      for (const file of [...pair.pickers, ...pair.actions]) touched.add(file)
    }
    expect(touched.size).toBeGreaterThan(8)
    expect(read("src/lib/constants/status.ts")).toContain("export const TERMINAL_WORK_ORDER_STATUSES")
  })
})
