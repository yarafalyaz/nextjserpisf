import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  })
  const prismaMock: Record<string, unknown> = {
    salesInvoice: model(),
    invoiceCollectionFollowUp: model(),
    journalEntry: model(),
    journalLine: model(),
  }
  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivityMock,
}))

import * as actions from "../invoice-collection.actions"

type ModelMock = {
  findFirst: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}
const followUpModel = mocks.prismaMock.invoiceCollectionFollowUp as ModelMock
const invoiceModel = mocks.prismaMock.salesInvoice as ModelMock
const journalModel = mocks.prismaMock.journalEntry as ModelMock

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.set(k, v)
  return f
}

const base = {
  salesInvoiceId: "10",
  followedUpAt: "2026-10-22",
  channel: "whatsapp",
  outcome: "terhubung_janji_bayar",
  promisedDate: "2026-10-25",
  promisedAmount: "500000",
  notes: "Pelanggan janji transfer",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  invoiceModel.findFirst.mockResolvedValue({
    id: 10,
    documentNo: "INV-10",
    status: "posted",
  })
  followUpModel.create.mockResolvedValue({ id: 99 })
  followUpModel.findFirst.mockResolvedValue({
    id: 99,
    salesInvoice: { documentNo: "INV-10" },
  })
  followUpModel.update.mockResolvedValue({})
})

describe("createInvoiceCollectionFollowUp (F-089 tahap 2)", () => {
  it("AC-COL-7: tanpa izin baru ditolak server sebelum DB", async () => {
    mocks.requirePermissionMock.mockRejectedValue(new Error("NEXT_REDIRECT"))
    const res = await actions.createInvoiceCollectionFollowUp(fd(base))
    expect(res.success).toBe(false)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith(
      "create_invoice_collection_followups",
    )
    expect(followUpModel.create).not.toHaveBeenCalled()
  })

  it("AC-COL-8: tersimpan append-only + ActivityLog; jurnal/faktur tidak disentuh", async () => {
    const res = await actions.createInvoiceCollectionFollowUp(fd(base))
    expect(res).toEqual({ success: true, id: 99 })
    expect(followUpModel.create).toHaveBeenCalledTimes(1)
    const arg = followUpModel.create.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(arg.data.channel).toBe("whatsapp")
    expect(arg.data.outcome).toBe("terhubung_janji_bayar")
    expect(arg.data.createdBy).toBe(7)
    expect(mocks.logActivityMock).toHaveBeenCalledWith(
      "invoice_collection_followup_created",
      "InvoiceCollectionFollowUp",
      99,
      expect.stringContaining("INV-10"),
    )
    expect(journalModel.create).not.toHaveBeenCalled()
    expect(invoiceModel.update).not.toHaveBeenCalled()
  })

  it("AC-COL-11: janji lampau + nominal nol ditolak, tidak tersimpan", async () => {
    const lampau = await actions.createInvoiceCollectionFollowUp(
      fd({ ...base, promisedDate: "2026-10-21" }),
    )
    expect(lampau.success).toBe(false)
    expect(lampau.error).toContain("tidak boleh sebelum")
    const nol = await actions.createInvoiceCollectionFollowUp(
      fd({ ...base, promisedAmount: "0" }),
    )
    expect(nol.success).toBe(false)
    expect(followUpModel.create).not.toHaveBeenCalled()
  })

  it("channel di luar kosakata Q-COL-2 ditolak", async () => {
    const res = await actions.createInvoiceCollectionFollowUp(
      fd({ ...base, channel: "sms" }),
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain("Kanal")
    expect(followUpModel.create).not.toHaveBeenCalled()
  })

  it("AC-COL-12: dua catat bersamaan keduanya tersimpan (append)", async () => {
    const [a, b] = await Promise.all([
      actions.createInvoiceCollectionFollowUp(fd(base)),
      actions.createInvoiceCollectionFollowUp(
        fd({ ...base, promisedDate: "2026-10-28" }),
      ),
    ])
    expect(a.success).toBe(true)
    expect(b.success).toBe(true)
    expect(followUpModel.create).toHaveBeenCalledTimes(2)
  })

  it("faktur draft tidak bisa dicatat tindak lanjutnya", async () => {
    invoiceModel.findFirst.mockResolvedValue({
      id: 10,
      documentNo: "INV-10",
      status: "draft",
    })
    const res = await actions.createInvoiceCollectionFollowUp(fd(base))
    expect(res.success).toBe(false)
    expect(followUpModel.create).not.toHaveBeenCalled()
  })
})

describe("deleteInvoiceCollectionFollowUp (Q-COL-1)", () => {
  it("soft-delete wajib izin catat + view_reports, tercatat log", async () => {
    const res = await actions.deleteInvoiceCollectionFollowUp(fd({ id: "99" }))
    expect(res.success).toBe(true)
    expect(mocks.requirePermissionMock.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      "create_invoice_collection_followups",
      "view_reports",
    ])
    const arg = followUpModel.update.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(arg.data.deletedAt).toBeInstanceOf(Date)
    expect(mocks.logActivityMock).toHaveBeenCalledWith(
      "invoice_collection_followup_deleted",
      "InvoiceCollectionFollowUp",
      99,
      expect.stringContaining("INV-10"),
    )
  })

  it("tanpa view_reports soft-delete tertahan sebelum update", async () => {
    mocks.requirePermissionMock
      .mockResolvedValueOnce({ id: 7 })
      .mockRejectedValueOnce(new Error("NEXT_REDIRECT"))
    const res = await actions.deleteInvoiceCollectionFollowUp(fd({ id: "99" }))
    expect(res.success).toBe(false)
    expect(followUpModel.update).not.toHaveBeenCalled()
  })
})
