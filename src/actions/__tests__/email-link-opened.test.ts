import { describe, it, expect, vi, beforeEach } from "vitest"
import { recordEmailLinkOpened } from "../email-log.actions"
import { recordWhatsappLinkOpened } from "../whatsapp-log.actions"

// F-2026-10-25-043-B1: catat klik email statement. Kontrak AC-SE-B1..B5:
// 1 baris email_link_opened berjangkar pelanggan, metadata periode tanpa
// PII, tanpa view_reports ditolak tanpa log, kegagalan catat tidak pernah
// melempar, dua klik = dua baris. Kanal email TIDAK tertulis ke aksi WA.

const m = await vi.hoisted(async () => {
  const { vi: v } = await import("vitest")
  const fn = () => v.fn()
  return {
    hasPermissionMock: fn(),
    logActivityMock: fn(),
    cFindFirst: fn(),
    woFindUnique: fn(),
    siFindUnique: fn(),
    qFindUnique: fn(),
  }
})
const { hasPermissionMock, logActivityMock, cFindFirst } = m

vi.mock("@/lib/auth/permissions", () => ({ hasPermission: m.hasPermissionMock }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customer: { findFirst: m.cFindFirst },
    workOrder: { findUnique: m.woFindUnique },
    salesInvoice: { findUnique: m.siFindUnique },
    quotation: { findUnique: m.qFindUnique },
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: m.logActivityMock }))

beforeEach(() => {
  vi.clearAllMocks()
  // Default: berizin + pelanggan ada + log sukses; tes menimpa per kasus.
  for (const [mock, value] of [
    [hasPermissionMock, true],
    [logActivityMock, undefined],
    [cFindFirst, { id: 7 }],
    [m.woFindUnique, { documentNo: "WO-001" }],
    [m.siFindUnique, { documentNo: "INV-001" }],
    [m.qFindUnique, { documentNo: "QUO-001" }],
  ] as const) {
    mock.mockResolvedValue(value)
  }
})

const STMT_PERIOD = {
  periodStart: new Date(2026, 0, 1),
  periodEnd: new Date(2026, 1, 28),
}

describe("recordEmailLinkOpened (F-2026-10-25-043-B1)", () => {
  it("AC-SE-B1: satu log/klik berjangkar pelanggan, metadata periode tanpa PII", async () => {
    const res = await recordEmailLinkOpened({
      modelType: "CustomerStatement",
      modelId: 7,
      surface: "detail",
      ...STMT_PERIOD,
    })

    expect(res.success).toBe(true)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_reports")
    expect(cFindFirst).toHaveBeenCalledWith({ where: { id: 7, deletedAt: null }, select: { id: true } })
    expect(logActivityMock).toHaveBeenCalledTimes(1)
    const [action, kind, anchorId, label, meta] = logActivityMock.mock.calls[0]
    expect([action, kind, anchorId, label]).toEqual([
      "email_link_opened",
      "CustomerStatement",
      7,
      "Tautan Email dibuka untuk Statement Pelanggan",
    ])
    expect(meta).toEqual({
      channel: "email",
      event: "link_opened",
      surface: "detail",
      periodStart: "2026-01-01",
      periodEnd: "2026-02-28",
    })
    const payload = JSON.stringify(logActivityMock.mock.calls[0])
    expect(payload).not.toMatch(/uji@example|@|subjek|subject|isi pesan|tagihan|terkirim/i)
    expect(payload).not.toContain("whatsapp")
  })

  it("AC-SE-B2: tanpa view_reports -> ditolak {success:false} TANPA log dan tanpa query pelanggan", async () => {
    hasPermissionMock.mockResolvedValue(false)

    const res = await recordEmailLinkOpened({
      modelType: "CustomerStatement",
      modelId: 7,
      surface: "detail",
      ...STMT_PERIOD,
    })

    expect(res.success).toBe(false)
    expect(logActivityMock).not.toHaveBeenCalled()
    expect(cFindFirst).not.toHaveBeenCalled()
  })

  it("AC-SE-B3: kanal email tidak pernah tertulis ke aksi whatsapp; jalur WA tetap byte-sama", async () => {
    const res = await recordEmailLinkOpened({
      modelType: "CustomerStatement",
      modelId: 7,
      surface: "detail",
      ...STMT_PERIOD,
    })
    expect(res.success).toBe(true)
    expect(logActivityMock.mock.calls[0][0]).toBe("email_link_opened")
    expect(logActivityMock.mock.calls[0][4]).toMatchObject({ channel: "email" })

    // Jalur WA existing tidak berubah oleh aksi email.
    vi.clearAllMocks()
    hasPermissionMock.mockResolvedValue(true)
    logActivityMock.mockResolvedValue(undefined)
    const wa = await recordWhatsappLinkOpened({
      modelType: "WorkOrder",
      modelId: 10,
      surface: "queue",
    })
    expect(wa.success).toBe(true)
    expect(logActivityMock).toHaveBeenCalledWith(
      "whatsapp_link_opened",
      "WorkOrder",
      10,
      "Tautan WhatsApp dibuka untuk Perintah Kerja WO-001",
      { channel: "whatsapp", event: "link_opened", surface: "queue" },
    )
  })

  it("pelanggan tidak ditemukan/terhapus -> ditolak tanpa log", async () => {
    cFindFirst.mockResolvedValue(null)

    const res = await recordEmailLinkOpened({
      modelType: "CustomerStatement",
      modelId: 404,
      surface: "detail",
      ...STMT_PERIOD,
    })

    expect(res.success).toBe(false)
    expect(logActivityMock).not.toHaveBeenCalled()
  })

  it("input tidak valid -> ditolak tanpa log", async () => {
    for (const bad of [
      { modelType: "WorkOrder", modelId: 1, surface: "detail", ...STMT_PERIOD },
      { modelType: "SalesInvoice", modelId: 1, surface: "detail", ...STMT_PERIOD },
      { modelType: "CustomerStatement", modelId: 0, surface: "detail", ...STMT_PERIOD },
      { modelType: "CustomerStatement", modelId: 1.5, surface: "detail", ...STMT_PERIOD },
      { modelType: "CustomerStatement", modelId: 7, surface: "queue", ...STMT_PERIOD },
      { modelType: "CustomerStatement", modelId: 7, surface: "detail" },
      { modelType: "CustomerStatement", modelId: 7, surface: "detail", periodStart: STMT_PERIOD.periodStart },
      {
        modelType: "CustomerStatement",
        modelId: 7,
        surface: "detail",
        periodStart: "2026-01-01" as unknown as Date,
        periodEnd: STMT_PERIOD.periodEnd,
      },
      {
        modelType: "CustomerStatement",
        modelId: 7,
        surface: "detail",
        periodStart: new Date("bukan-tanggal"),
        periodEnd: STMT_PERIOD.periodEnd,
      },
    ]) {
      const res = await recordEmailLinkOpened(bad)
      expect(res.success).toBe(false)
    }
    expect(logActivityMock).not.toHaveBeenCalled()
    expect(cFindFirst).not.toHaveBeenCalled()
  })

  it("AC-SE-B4: logActivity melempar -> aksi TIDAK melempar (klien email tetap jalan)", async () => {
    logActivityMock.mockRejectedValue(new Error("db mati"))

    const res = await recordEmailLinkOpened({
      modelType: "CustomerStatement",
      modelId: 7,
      surface: "detail",
      ...STMT_PERIOD,
    })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Gagal mencatat/)
  })

  it("AC-SE-B5: dua klik = dua baris jejak (tidak ada dedup)", async () => {
    const input = {
      modelType: "CustomerStatement",
      modelId: 7,
      surface: "detail",
      ...STMT_PERIOD,
    }

    expect((await recordEmailLinkOpened(input)).success).toBe(true)
    expect((await recordEmailLinkOpened(input)).success).toBe(true)

    expect(logActivityMock).toHaveBeenCalledTimes(2)
    expect(logActivityMock.mock.calls[0][0]).toBe("email_link_opened")
    expect(logActivityMock.mock.calls[1][0]).toBe("email_link_opened")
    expect(logActivityMock.mock.calls[0][2]).toBe(7)
    expect(logActivityMock.mock.calls[1][2]).toBe(7)
  })
})
