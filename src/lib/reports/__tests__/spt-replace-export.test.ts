import { describe, expect, it } from "vitest"
import { buildVatInvoiceList } from "../vat-invoices"
import { buildSptReplaceCsv, getReplaceSchemaEligibility } from "../spt-replace-export"

describe("getReplaceSchemaEligibility (PER-12/PJ/2026)", () => {
  it("menolak masa sebelum 2025 meskipun disampaikan setelah 1 Okt 2026", () => {
    const res = getReplaceSchemaEligibility(
      new Date("2024-12-01T00:00:00+07:00"),
      new Date("2026-10-15T10:00:00+07:00"),
    )
    expect(res.eligible).toBe(false)
    expect(res.reason).toContain("2024")
  })

  it("menolak penyampaian sebelum 1 Oktober 2026 meskipun masa >= 2025", () => {
    const res = getReplaceSchemaEligibility(
      new Date("2026-03-01T00:00:00+07:00"),
      new Date("2026-09-30T23:59:59+07:00"),
    )
    expect(res.eligible).toBe(false)
  })

  it("mengizinkan masa >= 2025 dan penyampaian >= 1 Oktober 2026", () => {
    const res = getReplaceSchemaEligibility(
      new Date("2025-01-01T00:00:00+07:00"),
      new Date("2026-10-01T00:00:00+07:00"),
    )
    expect(res.eligible).toBe(true)
  })

  it("menerima masa 2025-01 walau periodStart berupa instan tengah malam WIB (2024-12-31T17:00:00Z)", () => {
    const res = getReplaceSchemaEligibility(
      new Date("2024-12-31T17:00:00.000Z"),
      new Date("2026-10-01T00:00:00+07:00"),
    )
    expect(res.eligible).toBe(true)
  })
})

describe("buildSptReplaceCsv (R2 tie-out Rp0,00)", () => {
  it("menghasilkan nama file berlabel PEMBETULAN-REPLACE dan total tie-out persis hingga sen", () => {
    const raw = {
      output: [
        {
          date: new Date("2026-10-05T00:00:00+07:00"),
          documentNo: "INV-2026-001",
          taxInvoiceNumber: "010.001-26.00000001",
          counterparty: "PT Maju Jaya",
          npwp: "01.234.567.8-901.000",
          dpp: 10_000_000.5,
          vat: 1_100_000.06,
          total: 11_100_000.56,
        },
      ],
      input: [
        {
          date: new Date("2026-10-10T00:00:00+07:00"),
          documentNo: "BILL-2026-009",
          taxInvoiceNumber: "010.002-26.00000099",
          counterparty: "PT Pemasok, Tbk",
          npwp: "02.345.678.9-012.000",
          dpp: 4_000_000,
          vat: 440_000,
          total: 4_440_000,
        },
      ],
      returnDeductions: [
        {
          date: new Date("2026-10-18T00:00:00+07:00"),
          documentNo: "RET-2026-001",
          sourceDocumentNo: "INV-2026-001",
          counterparty: "PT Maju Jaya",
          dpp: 1_000_000,
          vat: 110_000,
        },
      ],
    }

    const report = buildVatInvoiceList(raw)
    const exported = buildSptReplaceCsv({
      periodSlug: "2026-10",
      report,
      raw,
      exportedAt: new Date("2026-11-14T12:00:00+07:00"),
    })

    expect(exported.filename).toMatch(/^SPT-PPN_2026-10_PEMBETULAN-REPLACE_\d{12}\.csv$/)
    expect(exported.rowCount).toBe(3)
    expect(exported.totals.outputDpp).toBe(report.output.dpp)
    expect(exported.totals.outputVat).toBe(report.output.vat)
    expect(exported.totals.inputDpp).toBe(report.input.dpp)
    expect(exported.totals.inputVat).toBe(report.input.vat)
    expect(exported.totals.returnVat).toBe(report.returnDeduction.vat)
    expect(exported.totals.outputNetVat).toBe(report.outputNetVat)
    expect(exported.totals.netVat).toBe(report.netVat)
    expect(exported.csv).toContain('"PT Pemasok, Tbk"')
    expect(exported.csv).toContain("010.001-26.00000001")
  })

  it("menerima masa 2025-01 walau periodStart berupa instan tengah malam WIB (2024-12-31T17:00:00Z)", () => {
    const res = getReplaceSchemaEligibility(
      new Date("2024-12-31T17:00:00.000Z"),
      new Date("2026-10-01T00:00:00+07:00"),
    )
    expect(res.eligible).toBe(true)
  })
})
