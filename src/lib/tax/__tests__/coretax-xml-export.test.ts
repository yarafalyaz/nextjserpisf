import { describe, it, expect } from "vitest"

import {
  buildCoretaxOutputXml,
  coretaxExportIdempotencyKey,
  coretaxTransactionCodeDisplay,
  CORETAX_TEMPLATE_VERSION,
  EXPORT_FILE_CREATED_LABEL,
  EXPORT_READY_LABEL,
  type CoretaxExportInvoiceSnapshot,
  type CoretaxExportSellerSnapshot,
} from "@/lib/tax/coretax-xml-export"

/**
 * Acceptance BOT 6 E113-1..9 (vonis F-2026-10-23-113-V, PR #619).
 * Builder murni: snapshot persis → XML template resmi v1.4. Setiap tes
 * di bawah adalah penjaga yang bila dicabut membuat perilaku salah lolos.
 */

const SELLER: CoretaxExportSellerSnapshot = {
  tin: "1090000000002325",
  sellerIdtku: "1090000000002325000000",
}

function base(over: Partial<CoretaxExportInvoiceSnapshot> = {}): CoretaxExportInvoiceSnapshot {
  return {
    taxInvoiceId: 1,
    direction: "out",
    transactionCode: "04",
    taxInvoiceNumber: "040.001-26.00000001",
    taxInvoiceDate: new Date(2026, 0, 15),
    // Contoh wajib vonis: harga 12.000.000 → DPP 11.000.000 + PPN 1.320.000.
    dpp: 11_000_000,
    taxRate: 12,
    taxAmount: 1_320_000,
    djpStatus: "draft",
    replacesId: null,
    counterpartyTaxId: "3174061502560010",
    counterpartyName: "Kongsi PPN",
    counterpartyNitku: "1090000000002325000000",
    buyerAddress: "Jalan Jakarta",
    buyerEmail: "a2@some.com",
    sourceStatus: "posted",
    lines: [
      {
        description: "Barang ABC",
        qty: 1,
        uom: "PCS",
        unitPrice: 12_000_000,
        discount: 0,
        total: 12_000_000,
        isService: false,
      },
    ],
    ...over,
  }
}

describe("E113 snapshot persis (inti)", () => {
  it("kode 04 harga 12.000.000 → XML DPP 11.000.000 + PPN 1.320.000 persis snapshot", () => {
    const r = buildCoretaxOutputXml([base()], SELLER)
    expect(r.rejections).toEqual([])
    expect(r.exportedIds).toEqual([1])
    expect(r.xml).toContain("<TaxBase>12000000.00</TaxBase>")
    expect(r.xml).toContain("<OtherTaxBase>11000000.00</OtherTaxBase>")
    expect(r.xml).toContain("<VAT>1320000.00</VAT>")
    expect(r.xml).toContain("<TrxCode>04</TrxCode>")
    expect(r.xml).toContain("<BuyerTin>3174061502560010</BuyerTin>")
    expect(r.xmlHash).toMatch(/^[a-f0-9]{64}$/)
    expect(r.readyLabel).toBe("siap impor Coretax")
    expect(r.fileCreatedLabel).toBe("berkas XML dibentuk")
  })

  it("E113-2: snapshot berubah TIDAK — XML byte-sama dari snapshot, bukan master berjalan", () => {
    // Builder hanya menerima snapshot; dua panggilan snapshot sama = byte+hash sama,
    // walau "harga berjalan" di luar berubah (tidak ada input master ke builder).
    const a = buildCoretaxOutputXml([base()], SELLER)
    const b = buildCoretaxOutputXml([base()], SELLER)
    expect(b.xml).toBe(a.xml)
    expect(b.xmlHash).toBe(a.xmlHash)
  })

  it("E113-5: ekspor ulang (faktur, versi template) sama → hash + kunci idempotensi sama, tanpa peristiwa ganda di hasil", () => {
    const a = buildCoretaxOutputXml([base()], SELLER)
    const b = buildCoretaxOutputXml([base()], SELLER)
    expect(b.xmlHash).toBe(a.xmlHash)
    expect(coretaxExportIdempotencyKey(1, CORETAX_TEMPLATE_VERSION)).toBe(
      coretaxExportIdempotencyKey(1, CORETAX_TEMPLATE_VERSION),
    )
    expect(coretaxExportIdempotencyKey(1, "versi-lain")).not.toBe(
      coretaxExportIdempotencyKey(1, CORETAX_TEMPLATE_VERSION),
    )
  })
})

describe("E113 gerbang fail-closed", () => {
  it("E113-1: cancelled/replaced ditolak bernama, tidak masuk XML", () => {
    for (const djpStatus of ["cancelled", "replaced"]) {
      const r = buildCoretaxOutputXml([base({ djpStatus })], SELLER)
      expect(r.xml).toBeNull()
      expect(r.exportedIds).toEqual([])
      expect(r.rejections[0].code).toBe("CANCELLED_OR_REPLACED")
    }
  })

  it("faktur arah in + tanpa nomor + sumber belum posted ditolak bernama", () => {
    const r = buildCoretaxOutputXml(
      [
        base({ taxInvoiceId: 2, direction: "in" }),
        base({ taxInvoiceId: 3, taxInvoiceNumber: "  " }),
        base({ taxInvoiceId: 4, sourceStatus: "draft" }),
      ],
      SELLER,
    )
    expect(r.xml).toBeNull()
    const codes = r.rejections.map((x) => x.code)
    expect(codes).toContain("NOT_OUTPUT")
    expect(codes).toContain("MISSING_TAX_INVOICE_NUMBER")
    expect(codes).toContain("SOURCE_NOT_POSTED")
  })

  it("E113-6: tanpa NPWP/nama/NITKU/alamat pembeli ditolak bernama", () => {
    const r = buildCoretaxOutputXml(
      [
        base({ taxInvoiceId: 5, counterpartyTaxId: null }),
        base({ taxInvoiceId: 6, counterpartyName: null }),
        base({ taxInvoiceId: 7, counterpartyNitku: null }),
        base({ taxInvoiceId: 8, buyerAddress: null }),
      ],
      SELLER,
    )
    expect(r.xml).toBeNull()
    const codes = r.rejections.map((x) => x.code)
    expect(codes).toContain("MISSING_BUYER_TAX_ID")
    expect(codes).toContain("MISSING_BUYER_NAME")
    expect(codes).toContain("MISSING_BUYER_IDTKU")
    expect(codes).toContain("MISSING_BUYER_ADDRESS")
  })

  it("E113-3: Σ baris ≠ DPP header → tolak rekonsiliasi, tanpa penyesuaian diam-diam", () => {
    const r = buildCoretaxOutputXml([base({ dpp: 10_000_000 })], SELLER)
    expect(r.xml).toBeNull()
    expect(r.rejections[0].code).toBe("LINE_SUM_MISMATCH")
    expect(r.rejections[0].reason).toMatch(/temuan rekonsiliasi/)
  })

  it("E113-7: asal + pengganti satu batch → keduanya ditolak", () => {
    const origin = base({ taxInvoiceId: 10 })
    const replacement = base({
      taxInvoiceId: 11,
      replacesId: 10,
      replacedTaxInvoiceNumber: "040.001-26.00000001",
    })
    const r = buildCoretaxOutputXml([origin, replacement], SELLER)
    expect(r.xml).toBeNull()
    expect(r.rejections.map((x) => x.code)).toEqual([
      "CHAIN_HEAD_AND_ORIGIN_SAME_BATCH",
      "CHAIN_HEAD_AND_ORIGIN_SAME_BATCH",
    ])
  })

  it("pengganti sendiri (tanpa asal di batch) lolos dengan rujukan faktur diganti", () => {
    const r = buildCoretaxOutputXml(
      [base({ taxInvoiceId: 11, replacesId: 10, replacedTaxInvoiceNumber: "040.001-26.00000001" })],
      SELLER,
    )
    expect(r.rejections).toEqual([])
    expect(r.xml).toContain("<TaxInvoiceOpt>Replacement</TaxInvoiceOpt>")
    expect(r.xml).toContain("<RefDesc>040.001-26.00000001</RefDesc>")
  })

  it("E113-8: elemen wajib tak terpetakan (SellerIDTKU, satuan, AddInfo 07) → tolak bernama, bukan karangan", () => {
    const noSellerIdtku = buildCoretaxOutputXml([base()], { tin: SELLER.tin, sellerIdtku: null })
    expect(noSellerIdtku.xml).toBeNull()
    expect(noSellerIdtku.rejections[0].code).toBe("MISSING_SELLER_IDTKU")
    expect(noSellerIdtku.rejections[0].reason).toMatch(/SellerIDTKU/)

    const badUnit = buildCoretaxOutputXml(
      [base({ lines: [{ description: "X", qty: 1, uom: "KARUNG", unitPrice: 12_000_000, discount: 0, total: 12_000_000, isService: false }] })],
      SELLER,
    )
    expect(badUnit.xml).toBeNull()
    expect(badUnit.rejections.some((x) => x.code === "UNMAPPED_REQUIRED_ELEMENT" && /Unit/.test(x.reason))).toBe(true)

    const code07 = buildCoretaxOutputXml(
      [base({ transactionCode: "07", dpp: 12_000_000, taxAmount: 0 })],
      SELLER,
    )
    expect(code07.xml).toBeNull()
    expect(code07.rejections.some((x) => /AddInfo/.test(x.reason))).toBe(true)
    expect(code07.rejections.some((x) => /FacilityStamp/.test(x.reason))).toBe(true)
  })

  it("batch parsial: faktur sah tetap diekspor, tertolak tercatat bernama (gerbang parsial)", () => {
    const r = buildCoretaxOutputXml([base(), base({ taxInvoiceId: 9, djpStatus: "cancelled" })], SELLER)
    expect(r.exportedIds).toEqual([1])
    expect(r.rejections).toHaveLength(1)
    expect(r.rejections[0].taxInvoiceId).toBe(9)
  })

  it("batch > 100 ditolak sebagai batas batching operasional", () => {
    const many = Array.from({ length: 101 }, (_, i) => base({ taxInvoiceId: 100 + i }))
    const r = buildCoretaxOutputXml(many, SELLER)
    expect(r.xml).toBeNull()
    expect(r.rejections[0].code).toBe("BATCH_TOO_LARGE")
  })
})

describe("E113-4/E113-9 status & label", () => {
  it("E113-4: builder murni tidak mengubah status — hasil tidak memuat mutasi djpStatus/dokumen", () => {
    const input = base()
    const snapshotBefore = JSON.stringify({ ...input, taxInvoiceDate: input.taxInvoiceDate.toISOString() })
    const r = buildCoretaxOutputXml([input], SELLER)
    expect(JSON.stringify({ ...input, taxInvoiceDate: input.taxInvoiceDate.toISOString() })).toBe(snapshotBefore)
    // Kontrak hasil tidak punya field status DJP/dokumen yang bisa disalahbaca sebagai persetujuan.
    expect(Object.keys(r).sort()).toEqual(
      ["exportedIds", "fileCreatedLabel", "readyLabel", "rejections", "templateVersion", "xml", "xmlHash"].sort(),
    )
  })

  it("E113-9: label maksimum = siap impor Coretax; tidak ada klaim terkirim/terdaftar DJP", () => {
    expect(EXPORT_READY_LABEL).toBe("siap impor Coretax")
    expect(EXPORT_FILE_CREATED_LABEL).toBe("berkas XML dibentuk")
    const r = buildCoretaxOutputXml([base()], SELLER)
    expect(r.xml).not.toMatch(/terkirim|terdaftar di DJP|disetujui DJP/i)
  })
})

describe("pemetaan bentuk template resmi", () => {
  it("kode 10 tampil 010 (satu-satunya pad); kode lain tetap 2 digit", () => {
    expect(coretaxTransactionCodeDisplay("10")).toBe("010")
    expect(coretaxTransactionCodeDisplay("04")).toBe("04")
    expect(coretaxTransactionCodeDisplay("01")).toBe("01")
  })

  it("escape XML pada nama pembeli/barang", () => {
    const r = buildCoretaxOutputXml([base({ counterpartyName: "PT A & B <C>" })], SELLER)
    expect(r.xml).toContain("PT A &amp; B &lt;C&gt;")
  })
})
