import { describe, it, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  issueTaxInvoice: vi.fn().mockResolvedValue({ success: true, id: 1 }),
  issueWithholdingCertificate: vi.fn().mockResolvedValue({ success: true, id: 1 }),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: 1 }),
}))
vi.mock("@/lib/services/tax-invoice.service", () => ({
  cancelTaxInvoice: vi.fn(),
  creditInputInvoice: vi.fn(),
  issueDownPaymentTaxInvoice: vi.fn(),
  issueTaxInvoice: (...a: unknown[]) => mocks.issueTaxInvoice(...(a as [])),
  replaceTaxInvoice: vi.fn(),
}))
vi.mock("@/lib/services/withholding-certificate.service", () => ({
  issueWithholdingCertificate: (...a: unknown[]) => mocks.issueWithholdingCertificate(...(a as [])),
  revokeWithholdingCertificate: vi.fn(),
  settleWithholdingTax: vi.fn(),
}))
vi.mock("@/lib/tax/coretax-xml-export", () => ({
  coretaxExportIdempotencyKey: vi.fn().mockReturnValue("key-coretax"),
}))
vi.mock("@/lib/tax/coretax-xml-export-data", () => ({
  loadCoretaxOutputExport: vi.fn(),
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))

import { issueTaxInvoiceAction, issueWithholdingCertificateAction } from "../tax-documents.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

describe("tanggal dokumen pajak dari form", () => {
  it("faktur: 2026-02-30 ditolak, bukan berputar ke 2 Maret", async () => {
    const res = await issueTaxInvoiceAction(fd({
      direction: "out",
      taxInvoiceNumber: "010.000-26.00000001",
      taxInvoiceDate: "2026-02-30",
      sellingPrice: "1000000",
      idempotencyKey: "kunci-uji-123",
    }))
    expect(res.success).toBe(false)
    expect(mocks.issueTaxInvoice).not.toHaveBeenCalled()
  })

  it("faktur: 2026-02-28 sah tersimpan sebagai tengah malam UTC hari itu", async () => {
    const res = await issueTaxInvoiceAction(fd({
      direction: "out",
      taxInvoiceNumber: "010.000-26.00000001",
      taxInvoiceDate: "2026-02-28",
      sellingPrice: "1000000",
      idempotencyKey: "kunci-uji-123",
    }))
    expect(res.success).toBe(true)
    const arg = mocks.issueTaxInvoice.mock.calls[0][0] as { taxInvoiceDate: Date }
    expect(arg.taxInvoiceDate.toISOString()).toBe("2026-02-28T00:00:00.000Z")
  })

  it("bupot: 2026-02-30 ditolak", async () => {
    const res = await issueWithholdingCertificateAction(fd({
      direction: "we_withhold",
      certificateNumber: "BUPOT-1",
      withholdingDate: "2026-02-30",
      counterpartyName: "PT Uji",
      withholdingTypeId: "1",
      dpp: "1000000",
      idempotencyKey: "kunci-uji-123",
    }))
    expect(res.success).toBe(false)
    expect(mocks.issueWithholdingCertificate).not.toHaveBeenCalled()
  })
})
