import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  issueTaxInvoice: vi.fn(),
  replaceTaxInvoice: vi.fn(),
  cancelTaxInvoice: vi.fn(),
  creditInputInvoice: vi.fn(),
  issueWithholdingCertificate: vi.fn(),
  revokeWithholdingCertificate: vi.fn(),
  settleWithholdingTax: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/services/tax-invoice.service", () => ({
  issueTaxInvoice: mocks.issueTaxInvoice,
  replaceTaxInvoice: mocks.replaceTaxInvoice,
  cancelTaxInvoice: mocks.cancelTaxInvoice,
  creditInputInvoice: mocks.creditInputInvoice,
}))
vi.mock("@/lib/services/withholding-certificate.service", () => ({
  issueWithholdingCertificate: mocks.issueWithholdingCertificate,
  revokeWithholdingCertificate: mocks.revokeWithholdingCertificate,
  settleWithholdingTax: mocks.settleWithholdingTax,
}))

import {
  cancelTaxInvoiceAction,
  creditInputInvoiceAction,
  issueTaxInvoiceAction,
  issueWithholdingCertificateAction,
  replaceTaxInvoiceAction,
  revokeWithholdingCertificateAction,
  settleWithholdingTaxAction,
} from "../tax-documents.actions"

function fd(values: Record<string, string>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "7" })
})

describe("pengunci izin per aksi dokumen pajak (F-2026-10-21-034)", () => {
  it("4 aksi faktur wajib izin create_tax_invoices sebelum parse/delegasi", async () => {
    const cases: Array<[string, (form: FormData) => Promise<unknown>, Record<string, string>]> = [
      [
        "issueTaxInvoiceAction",
        issueTaxInvoiceAction,
        {
          direction: "out",
          taxInvoiceNumber: "010-000-test",
          taxInvoiceDate: "2026-10-21",
          sellingPrice: "1000",
          idempotencyKey: "idem-issue",
        },
      ],
      [
        "replaceTaxInvoiceAction",
        replaceTaxInvoiceAction,
        {
          replacesId: "1",
          taxInvoiceNumber: "010-000-test",
          taxInvoiceDate: "2026-10-21",
          sellingPrice: "1000",
          replaceReason: "koreksi",
          idempotencyKey: "idem-replace",
        },
      ],
      [
        "cancelTaxInvoiceAction",
        cancelTaxInvoiceAction,
        {
          id: "1",
          cancelReason: "batal",
          idempotencyKey: "idem-cancel",
        },
      ],
      [
        "creditInputInvoiceAction",
        creditInputInvoiceAction,
        {
          id: "1",
          creditPeriod: "2026-10",
          idempotencyKey: "idem-credit",
        },
      ],
    ]

    for (const [, action, values] of cases) {
      mocks.requirePermission.mockRejectedValueOnce(new Error("forbidden"))
      await expect(action(fd(values))).rejects.toThrow("forbidden")
      expect(mocks.requirePermission).toHaveBeenLastCalledWith("create_tax_invoices")
      vi.clearAllMocks()
      mocks.requirePermission.mockResolvedValue({ id: "7" })
    }

    expect(mocks.issueTaxInvoice).not.toHaveBeenCalled()
    expect(mocks.replaceTaxInvoice).not.toHaveBeenCalled()
    expect(mocks.cancelTaxInvoice).not.toHaveBeenCalled()
    expect(mocks.creditInputInvoice).not.toHaveBeenCalled()
  })

  it("2 aksi bupot wajib izin manage_withholding_certificates sebelum parse/delegasi", async () => {
    const cases: Array<[string, (form: FormData) => Promise<unknown>, Record<string, string>]> = [
      [
        "issueWithholdingCertificateAction",
        issueWithholdingCertificateAction,
        {
          direction: "we_withhold",
          certificateNumber: "BUPOT-1",
          withholdingDate: "2026-10-21",
          counterpartyName: "PT Uji",
          withholdingTypeId: "1",
          dpp: "1000",
          idempotencyKey: "idem-bupot",
        },
      ],
      [
        "revokeWithholdingCertificateAction",
        revokeWithholdingCertificateAction,
        { id: "1", idempotencyKey: "idem-revoke" },
      ],
    ]

    for (const [, action, values] of cases) {
      mocks.requirePermission.mockRejectedValueOnce(new Error("forbidden"))
      await expect(action(fd(values))).rejects.toThrow("forbidden")
      expect(mocks.requirePermission).toHaveBeenLastCalledWith(
        "manage_withholding_certificates",
      )
      vi.clearAllMocks()
      mocks.requirePermission.mockResolvedValue({ id: "7" })
    }

    expect(mocks.issueWithholdingCertificate).not.toHaveBeenCalled()
    expect(mocks.revokeWithholdingCertificate).not.toHaveBeenCalled()
  })

  it("aksi setor tetap wajib create_tax_payments, bukan izin dokumen", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("forbidden"))
    await expect(
      settleWithholdingTaxAction(
        fd({
          withholdingTypeId: "1",
          period: "2026-10",
          paymentAccountId: "1",
          amount: "1000",
          idempotencyKey: "idem-settle",
        }),
      ),
    ).rejects.toThrow("forbidden")
    expect(mocks.requirePermission).toHaveBeenLastCalledWith("create_tax_payments")
    expect(mocks.settleWithholdingTax).not.toHaveBeenCalled()
  })

  it("izin lolos: tiap aksi mendelegasikan ke service tepat satu kali", async () => {
    mocks.issueTaxInvoice.mockResolvedValue({ success: true, data: { id: 11 } })
    mocks.replaceTaxInvoice.mockResolvedValue({ success: true, data: { id: 12 } })
    mocks.cancelTaxInvoice.mockResolvedValue({ success: true, data: { id: 13 } })
    mocks.creditInputInvoice.mockResolvedValue({ success: true, data: { id: 14 } })
    mocks.issueWithholdingCertificate.mockResolvedValue({ success: true, data: { id: 15 } })
    mocks.revokeWithholdingCertificate.mockResolvedValue({ success: true, data: { id: 16 } })
    mocks.settleWithholdingTax.mockResolvedValue({ success: true, data: { id: 17 } })

    await issueTaxInvoiceAction(
      fd({
        direction: "out",
        taxInvoiceNumber: "010-000-test",
        taxInvoiceDate: "2026-10-21",
        sellingPrice: "1000",
        idempotencyKey: "idem-issue",
      }),
    )
    await replaceTaxInvoiceAction(
      fd({
        replacesId: "1",
        taxInvoiceNumber: "010-000-test",
        taxInvoiceDate: "2026-10-21",
        sellingPrice: "1000",
        replaceReason: "koreksi",
        idempotencyKey: "idem-replace",
      }),
    )
    await cancelTaxInvoiceAction(
      fd({ id: "1", cancelReason: "batal", idempotencyKey: "idem-cancel" }),
    )
    await creditInputInvoiceAction(
      fd({ id: "1", creditPeriod: "2026-10", idempotencyKey: "idem-credit" }),
    )
    await issueWithholdingCertificateAction(
      fd({
        direction: "we_withhold",
        certificateNumber: "BUPOT-1",
        withholdingDate: "2026-10-21",
        counterpartyName: "PT Uji",
        withholdingTypeId: "1",
        dpp: "1000",
        idempotencyKey: "idem-bupot",
      }),
    )
    await revokeWithholdingCertificateAction(
      fd({ id: "1", idempotencyKey: "idem-revoke" }),
    )
    await settleWithholdingTaxAction(
      fd({
        withholdingTypeId: "1",
        period: "2026-10",
        paymentAccountId: "1",
        amount: "1000",
        idempotencyKey: "idem-settle",
      }),
    )

    expect(mocks.requirePermission.mock.calls.map(([permission]) => permission)).toEqual([
      "create_tax_invoices",
      "create_tax_invoices",
      "create_tax_invoices",
      "create_tax_invoices",
      "manage_withholding_certificates",
      "manage_withholding_certificates",
      "create_tax_payments",
    ])
    expect(mocks.issueTaxInvoice).toHaveBeenCalledTimes(1)
    expect(mocks.replaceTaxInvoice).toHaveBeenCalledTimes(1)
    expect(mocks.cancelTaxInvoice).toHaveBeenCalledTimes(1)
    expect(mocks.creditInputInvoice).toHaveBeenCalledTimes(1)
    expect(mocks.issueWithholdingCertificate).toHaveBeenCalledTimes(1)
    expect(mocks.revokeWithholdingCertificate).toHaveBeenCalledTimes(1)
    expect(mocks.settleWithholdingTax).toHaveBeenCalledTimes(1)
  })
})
