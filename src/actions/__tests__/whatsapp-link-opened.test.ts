import { describe, it, expect, vi, beforeEach } from "vitest"
import { recordWhatsappLinkOpened } from "../whatsapp-log.actions"

// F-2026-10-21-036: catat klik WA per dokumen. Kontrak: 1 baris
// whatsapp_link_opened, metadata tanpa PII, tanpa izin = tolak tanpa log,
// kegagalan catat tidak pernah melempar (tautan tetap jalan).

const m = await vi.hoisted(async () => {
  const { vi: v } = await import("vitest")
  return {
    hasPermissionMock: v.fn(),
    logActivityMock: v.fn(),
    woFindUnique: v.fn(),
    siFindUnique: v.fn(),
    qFindUnique: v.fn(),
  }
})
const { hasPermissionMock, logActivityMock, woFindUnique, siFindUnique, qFindUnique } = m

vi.mock("@/lib/auth/permissions", () => ({ hasPermission: m.hasPermissionMock }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workOrder: { findUnique: m.woFindUnique },
    salesInvoice: { findUnique: m.siFindUnique },
    quotation: { findUnique: m.qFindUnique },
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: m.logActivityMock }))

beforeEach(() => {
  vi.clearAllMocks()
  hasPermissionMock.mockResolvedValue(true)
  logActivityMock.mockResolvedValue(undefined)
  woFindUnique.mockResolvedValue({ documentNo: "WO-001" })
  siFindUnique.mockResolvedValue({ documentNo: "INV-001" })
  qFindUnique.mockResolvedValue({ documentNo: "QUO-001" })
})

describe("recordWhatsappLinkOpened (F-2026-10-21-036)", () => {
  it("klik WO dari antrean -> 1 baris whatsapp_link_opened tanpa PII", async () => {
    const res = await recordWhatsappLinkOpened({
      modelType: "WorkOrder",
      modelId: 10,
      surface: "queue",
    })

    expect(res.success).toBe(true)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_work_orders")
    expect(logActivityMock).toHaveBeenCalledTimes(1)
    expect(logActivityMock).toHaveBeenCalledWith(
      "whatsapp_link_opened",
      "WorkOrder",
      10,
      "Tautan WhatsApp dibuka untuk Perintah Kerja WO-001",
      { channel: "whatsapp", event: "link_opened", surface: "queue" },
    )
    const payload = JSON.stringify(logActivityMock.mock.calls[0])
    expect(payload).not.toMatch(/62\d{8,}|pesan|message/i)
  })

  it("faktur memakai izin view_sales_invoices + label Faktur", async () => {
    const res = await recordWhatsappLinkOpened({
      modelType: "SalesInvoice",
      modelId: 7,
      surface: "detail",
    })

    expect(res.success).toBe(true)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_sales_invoices")
    expect(logActivityMock).toHaveBeenCalledWith(
      "whatsapp_link_opened",
      "SalesInvoice",
      7,
      "Tautan WhatsApp dibuka untuk Faktur INV-001",
      { channel: "whatsapp", event: "link_opened", surface: "detail" },
    )
  })

  it("penawaran memakai izin view_quotations + label Penawaran", async () => {
    const res = await recordWhatsappLinkOpened({
      modelType: "Quotation",
      modelId: 3,
      surface: "detail",
    })

    expect(res.success).toBe(true)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_quotations")
    expect(logActivityMock).toHaveBeenCalledWith(
      "whatsapp_link_opened",
      "Quotation",
      3,
      "Tautan WhatsApp dibuka untuk Penawaran QUO-001",
      expect.objectContaining({ surface: "detail" }),
    )
  })

  it("tanpa izin -> ditolak TANPA log dan tanpa query dokumen", async () => {
    hasPermissionMock.mockResolvedValue(false)

    const res = await recordWhatsappLinkOpened({
      modelType: "WorkOrder",
      modelId: 10,
      surface: "queue",
    })

    expect(res.success).toBe(false)
    expect(logActivityMock).not.toHaveBeenCalled()
    expect(woFindUnique).not.toHaveBeenCalled()
  })

  it("dokumen tidak ditemukan -> ditolak tanpa log", async () => {
    woFindUnique.mockResolvedValue(null)

    const res = await recordWhatsappLinkOpened({
      modelType: "WorkOrder",
      modelId: 404,
      surface: "detail",
    })

    expect(res.success).toBe(false)
    expect(logActivityMock).not.toHaveBeenCalled()
  })

  it("input tidak valid -> ditolak tanpa log", async () => {
    for (const bad of [
      { modelType: "Lead", modelId: 1, surface: "detail" },
      { modelType: "WorkOrder", modelId: 0, surface: "detail" },
      { modelType: "WorkOrder", modelId: 1.5, surface: "detail" },
      { modelType: "WorkOrder", modelId: 1, surface: "email" },
    ]) {
      const res = await recordWhatsappLinkOpened(bad)
      expect(res.success).toBe(false)
    }
    expect(logActivityMock).not.toHaveBeenCalled()
    expect(hasPermissionMock).not.toHaveBeenCalled()
  })

  it("logActivity melempar -> aksi TIDAK melempar, return success:false (tautan tetap jalan di pemanggil)", async () => {
    logActivityMock.mockRejectedValue(new Error("db mati"))

    const res = await recordWhatsappLinkOpened({
      modelType: "WorkOrder",
      modelId: 10,
      surface: "queue",
    })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Gagal mencatat/)
  })
})
