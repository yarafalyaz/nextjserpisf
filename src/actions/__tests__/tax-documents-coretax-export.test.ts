import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loadCoretaxOutputExport: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/tax/coretax-xml-export-data", () => ({
  loadCoretaxOutputExport: mocks.loadCoretaxOutputExport,
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivity,
}))

import { exportCoretaxOutputXmlAction } from "../tax-documents.actions"

function fd(values: Record<string, string>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: "7" })
  mocks.logActivity.mockResolvedValue(undefined)
})

describe("R6IE-07 exportCoretaxOutputXmlAction", () => {
  it("mencatat satu jejak ekspor per faktur dengan kunci idempotensi dan hash", async () => {
    const xml = "<TaxInvoiceBulk/>"
    const { createHash } = await import("node:crypto")
    mocks.loadCoretaxOutputExport.mockResolvedValue({
      xml,
      xmlHash: createHash("sha256").update(xml).digest("hex"),
      templateVersion: "FakturPK-v1.4-2025-03-01",
      exportedIds: [1, 2],
      rejections: [],
      readyLabel: "siap impor Coretax",
      fileCreatedLabel: "berkas XML dibentuk",
    })

    const result = await exportCoretaxOutputXmlAction(fd({ taxInvoiceIds: "1,2" }))
    expect(result.success).toBe(true)
    expect(mocks.logActivity).toHaveBeenCalledTimes(2)
    expect(mocks.logActivity).toHaveBeenCalledWith(
      "export",
      "TaxInvoice",
      1,
      "Ekspor XML Coretax faktur pajak #1",
      expect.objectContaining({
        key: "coretax-export:1:FakturPK-v1.4-2025-03-01",
        templateVersion: "FakturPK-v1.4-2025-03-01",
        xmlHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        exportedIds: [1, 2],
        exportedBy: 7,
      }),
    )
    expect(mocks.logActivity).toHaveBeenCalledWith(
      "export",
      "TaxInvoice",
      2,
      "Ekspor XML Coretax faktur pajak #2",
      expect.objectContaining({
        key: "coretax-export:2:FakturPK-v1.4-2025-03-01",
      }),
    )
  })

  it("tidak mencatat ekspor bila semua faktur tertolak", async () => {
    mocks.loadCoretaxOutputExport.mockResolvedValue({
      xml: null,
      xmlHash: null,
      templateVersion: "FakturPK-v1.4-2025-03-01",
      exportedIds: [],
      rejections: [{ taxInvoiceId: 1, code: "UNMAPPED_REQUIRED_ELEMENT", reason: "snapshot tidak lengkap" }],
      readyLabel: "siap impor Coretax",
      fileCreatedLabel: null,
    })

    const result = await exportCoretaxOutputXmlAction(fd({ taxInvoiceIds: "1" }))
    expect(result.success).toBe(true)
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })
})
