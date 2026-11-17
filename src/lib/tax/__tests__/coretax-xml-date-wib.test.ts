// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest"

import {
  buildCoretaxOutputXml,
  type CoretaxExportInvoiceSnapshot,
  type CoretaxExportSellerSnapshot,
} from "@/lib/tax/coretax-xml-export"

/**
 * Regresi audit 2026-11-17: `formatDate` di coretax-xml-export memakai
 * `getFullYear/getMonth/getDate` LOKAL proses. Tanggal faktur disimpan sebagai
 * tengah malam UTC hari WIB, jadi proses ber-TZ barat UTC menulis tanggal
 * SEHARI LEBIH AWAL ke XML sementara masa pajak (komponen UTC) tetap benar —
 * faktur masa 2026-11 masuk Coretax sebagai 2026-10-31.
 *
 * Tes ini memaksa TZ proses ke zona barat UTC; dengan implementasi lama tes
 * gagal, dengan `wibDateOnly` lolos berapa pun TZ container.
 */

const TZ_ASLI = process.env.TZ

beforeEach(() => {
  // UTC-5: tengah malam UTC 1 Nov = 31 Okt 19:00 lokal.
  process.env.TZ = "America/Bogota"
})

afterEach(() => {
  if (TZ_ASLI === undefined) delete process.env.TZ
  else process.env.TZ = TZ_ASLI
})

const SELLER: CoretaxExportSellerSnapshot = {
  tin: "1090000000002325",
  sellerIdtku: "1090000000002325000000",
}

function invoice(over: Partial<CoretaxExportInvoiceSnapshot> = {}): CoretaxExportInvoiceSnapshot {
  return {
    taxInvoiceId: 1,
    direction: "out",
    transactionCode: "04",
    taxInvoiceNumber: "040.001-26.00000001",
    // 1 Nov 2026 00:00 UTC = hari WIB 1 Nov (07:00 WIB). Proses UTC-5
    // membacanya sebagai 31 Okt 19:00 — inilah yang dulu bocor ke XML.
    taxInvoiceDate: new Date("2026-11-01T00:00:00.000Z"),
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

describe("tanggal XML Coretax memakai WIB, bukan zona proses", () => {
  it("faktur 1 Nov 2026 tetap tertulis 2026-11-01 di container UTC-5", () => {
    const r = buildCoretaxOutputXml([invoice()], SELLER)
    expect(r.rejections).toEqual([])
    expect(r.xml).toContain("<TaxInvoiceDate>2026-11-01</TaxInvoiceDate>")
    expect(r.xml).not.toContain("<TaxInvoiceDate>2026-10-31</TaxInvoiceDate>")
  })
})
