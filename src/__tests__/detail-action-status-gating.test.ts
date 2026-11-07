import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DRAFT_ONLY_EDIT_STATUSES,
  DRAFT_OR_PENDING_EDIT_STATUSES,
  PENDING_ONLY_EDIT_STATUSES,
} from "@/lib/constants/status"

/**
 * Penjaga: tombol Ubah/Hapus di halaman DETAIL harus menghormati status yang
 * dituntut action-nya.
 *
 * Kelas bug putaran 220–224 adalah soal IZIN: tombol tampil bagi peran yang
 * tak boleh memakainya. Kelas di sini beda — izinnya cukup, tetapi DOKUMENNYA
 * sudah keluar dari status yang boleh diedit. Halaman detail merender tombol
 * tanpa melihat status, jadi operator melihat "Ubah" pada PO yang sudah
 * diposting, mengklik, mengisi form, lalu ditolak `updatePurchaseOrder`
 * ("Hanya PO draft yang dapat diedit"). Untuk dokumen berjurnal lebih buruk
 * lagi: "Ubah" pada tagihan/pembayaran posted tampak seperti koreksi sah,
 * padahal jalur koreksinya void / pembayaran pengganti.
 *
 * Sembilan halaman detail diperbaiki pada putaran 226. Penjaga ini memeriksa
 * bahwa setiap halaman menyebut konstanta bersama DAN memakainya sebagai
 * syarat render, bukan sekadar mengimpornya.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")

interface Case {
  page: string
  /** Ekspresi gerbang yang harus muncul persis. */
  gate: RegExp
  /** Konstanta bersama yang harus dipakai (bila ada). */
  constant?: string
  /** Nama variabel status yang dihitung halaman. */
  variable: string
}

const CASES: Case[] = [
  {
    page: "pembelian/pesanan/[slug]/page.tsx",
    gate: /\{canEdit && isDraft && <Button href=\{entityEditHref\("\/pembelian\/pesanan"/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "pembelian/pesanan/[slug]/page.tsx",
    gate: /\{canDelete && isDraft && <DeleteButton/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "pembelian/permintaan/[slug]/page.tsx",
    gate: /\{canEdit && isDraft && <Button href=\{entityEditHref\("\/pembelian\/permintaan"/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "pembelian/permintaan/[slug]/page.tsx",
    gate: /\{canDelete && isDeletable && <DeleteButton/,
    variable: "isDeletable",
  },
  {
    page: "pembelian/tagihan/[slug]/page.tsx",
    gate: /\{isDraft && \(\s*<CanCreate permission="edit_vendor_bills">/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "pembelian/tagihan/[slug]/page.tsx",
    gate: /\{isDraft && \(\s*<CanCreate permission="delete_vendor_bills">/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "pembelian/pembayaran-vendor/[slug]/page.tsx",
    gate: /\{isDraft && \(\s*<CanCreate permission="edit_vendor_payments">/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "pembelian/pembayaran-vendor/[slug]/page.tsx",
    gate: /\{isDraft && \(\s*<CanCreate permission="delete_vendor_payments">/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "penjualan/retur/[slug]/page.tsx",
    gate: /\{isDraft && \(\s*<CanCreate permission="edit_sales_returns">/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "penjualan/retur/[slug]/page.tsx",
    gate: /\{isDraft && \(\s*<CanCreate permission="delete_sales_returns">/,
    constant: "DRAFT_ONLY_EDIT_STATUSES",
    variable: "isDraft",
  },
  {
    page: "produksi/production-orders/[slug]/page.tsx",
    gate: /\{canEditProductionOrder && isEditableStatus && \(\s*<Link href=\{entityEditHref\("\/produksi\/production-orders"/,
    constant: "DRAFT_OR_PENDING_EDIT_STATUSES",
    variable: "isEditableStatus",
  },
  {
    page: "produksi/production-orders/[slug]/page.tsx",
    gate: /\{canDeleteProductionOrder && isEditableStatus && \(\s*<DeleteButton/,
    constant: "DRAFT_OR_PENDING_EDIT_STATUSES",
    variable: "isEditableStatus",
  },
  {
    page: "sdm/cuti/[slug]/page.tsx",
    gate: /\{canEdit && isPending && \(\s*<Button href=\{entityEditHref\("\/sdm\/cuti"/,
    constant: "PENDING_ONLY_EDIT_STATUSES",
    variable: "isPending",
  },
  {
    page: "sdm/cuti/[slug]/page.tsx",
    gate: /\{canDelete && !isApproved && <DeleteButton/,
    variable: "isApproved",
  },
  {
    page: "sdm/lembur/[slug]/page.tsx",
    gate: /\{canEdit && isPending && \(\s*<Button href=\{entityEditHref\("\/sdm\/lembur"/,
    constant: "PENDING_ONLY_EDIT_STATUSES",
    variable: "isPending",
  },
  {
    page: "sdm/lembur/[slug]/page.tsx",
    gate: /\{canDelete && !isApproved && <DeleteButton/,
    variable: "isApproved",
  },
  {
    page: "sdm/pinjaman/[slug]/page.tsx",
    gate: /\{isPending && \(\s*<CanCreate permission="create_loans">/,
    constant: "PENDING_ONLY_EDIT_STATUSES",
    variable: "isPending",
  },
  {
    page: "sdm/pinjaman/[slug]/page.tsx",
    gate: /\{isDeletable && \(\s*<CanCreate permission="delete_loans">/,
    variable: "isDeletable",
  },
]

describe("tombol Ubah/Hapus halaman detail menghormati status dokumen (putaran 226)", () => {
  it("konstanta bersama berisi status yang diharapkan", () => {
    expect([...DRAFT_ONLY_EDIT_STATUSES]).toEqual(["draft"])
    expect([...DRAFT_OR_PENDING_EDIT_STATUSES]).toEqual(["draft", "pending"])
    expect([...PENDING_ONLY_EDIT_STATUSES]).toEqual(["pending"])
  })

  for (const c of CASES) {
    it(`${c.page} — tombol digerbangi ${c.variable}`, () => {
      const src = read(`src/app/(dashboard)/${c.page}`)
      expect(src, `gerbang ${c.variable} hilang dari tombol`).toMatch(c.gate)
    })
  }

  it("variabel gerbang dihitung dari konstanta bersama, bukan literal terpisah", () => {
    for (const c of CASES) {
      if (!c.constant) continue
      const src = read(`src/app/(dashboard)/${c.page}`)
      expect(
        src.includes(c.constant),
        `${c.page}: ${c.constant} tidak diimpor — gerbang status bisa menyimpang dari action`,
      ).toBe(true)
      const declared = new RegExp(
        `const ${c.variable} = \\(${c.constant} as readonly string\\[\\]\\)\\.includes\\(`,
      )
      expect(
        declared.test(src),
        `${c.page}: ${c.variable} tidak dihitung dari ${c.constant}`,
      ).toBe(true)
    }
  })

  it("action-nya membaca konstanta yang sama, bukan literal terpisah", () => {
    const checks: Array<[string, string, RegExp]> = [
      [
        "src/actions/purchase.actions.ts",
        "DRAFT_ONLY_EDIT_STATUSES",
        /DRAFT_ONLY_EDIT_STATUSES as readonly string\[\]\)\.includes\(po\.status\)/,
      ],
      [
        "src/actions/purchase.actions.ts",
        "DRAFT_ONLY_EDIT_STATUSES",
        /DRAFT_ONLY_EDIT_STATUSES as readonly string\[\]\)\.includes\(existingBill\.status\)/,
      ],
      [
        "src/actions/sales.actions.ts",
        "DRAFT_ONLY_EDIT_STATUSES",
        /DRAFT_ONLY_EDIT_STATUSES as readonly string\[\]\)\.includes\(existingReturn\.status\)/,
      ],
      [
        "src/actions/manufacturing.actions.ts",
        "DRAFT_OR_PENDING_EDIT_STATUSES",
        /DRAFT_OR_PENDING_EDIT_STATUSES as readonly string\[\]\)\.includes\(po\.status\)/,
      ],
      [
        "src/actions/hrm.actions.ts",
        "PENDING_ONLY_EDIT_STATUSES",
        /PENDING_ONLY_EDIT_STATUSES as readonly string\[\]\)\.includes\(existing\.status\)/,
      ],
    ]
    for (const [file, constant, pattern] of checks) {
      expect(pattern.test(read(file)), `${file} tidak menilai ${constant}`).toBe(true)
    }
  })

  it("halaman detail tidak lagi merender Ubah/Hapus tanpa syarat status", () => {
    // Ratchet: kalau seseorang menghapus gerbangnya, pola mentah ini muncul lagi.
    const raw: Array<[string, RegExp]> = [
      ["pembelian/pesanan/[slug]/page.tsx", /\{canEdit && <Button href=\{entityEditHref\("\/pembelian\/pesanan"/],
      ["pembelian/pesanan/[slug]/page.tsx", /\{canDelete && <DeleteButton id=\{po\.id\}/],
      ["pembelian/permintaan/[slug]/page.tsx", /\{canEdit && <Button href=\{entityEditHref\("\/pembelian\/permintaan"/],
      ["pembelian/permintaan/[slug]/page.tsx", /\{canDelete && <DeleteButton id=\{request\.id\}/],
      ["produksi/production-orders/[slug]/page.tsx", /<CanCreate permission="edit_production_orders">/],
      ["produksi/production-orders/[slug]/page.tsx", /<CanCreate permission="delete_production_orders">/],
      ["sdm/cuti/[slug]/page.tsx", /\{canEdit && \(\s*<Button href=\{entityEditHref\("\/sdm\/cuti"/],
      ["sdm/lembur/[slug]/page.tsx", /\{canEdit && \(\s*<Button href=\{entityEditHref\("\/sdm\/lembur"/],
    ]
    for (const [file, pattern] of raw) {
      expect(
        pattern.test(read(`src/app/(dashboard)/${file}`)),
        `${file}: gerbang status dicabut lagi`,
      ).toBe(false)
    }
  })
})
