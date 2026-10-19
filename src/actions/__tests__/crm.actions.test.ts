import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  })

  const prismaMock: any = {
    crmTicket: buildModelMock(),
    crmTicketComment: buildModelMock(),
    lead: buildModelMock(),
    leadActivity: buildModelMock(),
    customer: buildModelMock(),
    $queryRaw: vi.fn().mockResolvedValue([]),

    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001") }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path) => {
    const err = new Error("NEXT_REDIRECT")
    ;(err as any).digest = `NEXT_REDIRECT;replace;${path};307`
    throw err
  }),
}))

import * as actions from "../crm.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, permissions: ["manage_leads", "manage_tickets"], roles: ["super_admin"] })
})

describe("CRM Ticket Actions", () => {
  it("createTicket succeeds", async () => {
    const res = await actions.createTicket(fdMap({ subject: "Ticket Subject" }))
    expect(res?.success).toBe(true)
  })
  it("createTicket fails validation", async () => {
    const res = await actions.createTicket(fdMap({}))
    expect(res?.success).toBe(false)
  })
  it("createTicket handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.crmTicket.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createTicket(fdMap({ subject: "Ticket Subject" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateTicket succeeds", async () => {
    const res = await actions.updateTicket(1, fdMap({ subject: "Ticket Subject" }))
    expect(res?.success).toBe(true)
  })
  it("updateTicket fails validation", async () => {
    const res = await actions.updateTicket(1, fdMap({}))
    expect(res?.success).toBe(false)
  })
  it("updateTicket mengisi firstResponseAt saat keluar dari open", async () => {
    mocks.prismaMock.crmTicket.findFirst.mockResolvedValueOnce(null)
    mocks.prismaMock.crmTicket.findUnique.mockResolvedValueOnce({ status: "open", firstResponseAt: null, resolvedAt: null })
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", status: "in_progress" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.crmTicket.update.mock.calls[mocks.prismaMock.crmTicket.update.mock.calls.length - 1][0].data
    expect(data.firstResponseAt).toBeInstanceOf(Date)
    expect(data.resolvedAt).toBeUndefined()
  })
  it("updateTicket mengisi resolvedAt saat resolved", async () => {
    mocks.prismaMock.crmTicket.findFirst.mockResolvedValueOnce(null)
    mocks.prismaMock.crmTicket.findUnique.mockResolvedValueOnce({ status: "in_progress", firstResponseAt: new Date(), resolvedAt: null })
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", status: "resolved" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.crmTicket.update.mock.calls[mocks.prismaMock.crmTicket.update.mock.calls.length - 1][0].data
    expect(data.resolvedAt).toBeInstanceOf(Date)
  })
  it("updateTicket handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.crmTicket.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateTicket(1, fdMap({ subject: "Ticket Subject" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("deleteTicket succeeds", async () => {
    const res = await actions.deleteTicket(1)
    expect(res?.success).toBe(true)
  })
  it("deleteTicket handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.crmTicket.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteTicket(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})

describe("CRM Lead Actions", () => {
  it("deleteLead succeeds", async () => {
    await expect(actions.deleteLead(1)).rejects.toThrow("NEXT_REDIRECT")
  })
  it("deleteLead handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.lead.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteLead(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})

describe("CRM Actions - Next redirect errors are re-thrown", () => {
  const redirectError = () => {
    const err: any = new Error("NEXT_REDIRECT")
    err.digest = "NEXT_REDIRECT;replace;/login;307;"
    return err
  }

  it("createTicket re-throws redirect errors instead of swallowing them", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectError())
    await expect(actions.createTicket(fdMap({ subject: "Ticket Subject" }))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    })
  })

  it("updateTicket re-throws redirect errors instead of swallowing them", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectError())
    await expect(actions.updateTicket(1, fdMap({ subject: "Ticket Subject" }))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    })
  })

  it("deleteTicket re-throws redirect errors instead of swallowing them", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectError())
    await expect(actions.deleteTicket(1)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    })
  })

  it("deleteLead re-throws redirect errors instead of swallowing them", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(redirectError())
    await expect(actions.deleteLead(1)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    })
  })

  it("convertLead refuses to convert a lead assigned to another rep (non-admin)", async () => {
    // edit_leads only (not manage_leads) → not admin; lead belongs to rep #7.
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 3, permissions: ["edit_leads"], roles: ["sales"] })
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "qualified", assignedTo: 7, customerId: null,
    })

    const res = await actions.convertLead(1)

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/ditugaskan kepada Anda/i)
    expect(mocks.prismaMock.customer.create).not.toHaveBeenCalled()
  })

  it("convertLead allows an admin to convert another rep's lead", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 3, permissions: ["edit_leads", "manage_leads"], roles: ["admin"] })
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "qualified", assignedTo: 7, customerId: null,
    })

    const res = await actions.convertLead(1)

    expect(res.success).toBe(true)
  })
})

/**
 * Komentar tiket CRM — satu-satunya jalur tulis `crm_ticket_comments`.
 *
 * Sebelum aksi ini ada, halaman detail tiket merender daftar komentar beserta
 * keadaan kosongnya, tetapi tidak ada cara menambahkan komentar sama sekali.
 */
describe("addTicketComment", () => {
  it("menulis komentar dengan penulis dari SESI, bukan dari form", async () => {
    mocks.prismaMock.crmTicket.findFirst.mockResolvedValueOnce({ id: 7 })
    mocks.prismaMock.crmTicketComment.create.mockResolvedValueOnce({ id: 55 })

    const res = await actions.addTicketComment(
      7,
      // `userId` di form adalah upaya menulis atas nama orang lain — aksi harus
      // mengabaikannya dan memakai id pengguna sesi (1 pada mock ini).
      fdMap({ body: "Tindak lanjut via telepon", userId: "999" }),
    )

    expect(res).toEqual({ success: true, id: 55 })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_tickets")
    const arg = mocks.prismaMock.crmTicketComment.create.mock.calls[0][0]
    expect(arg.data.userId).toBe(1)
    expect(arg.data.ticketId).toBe(7)
    expect(arg.data.body).toBe("Tindak lanjut via telepon")
    expect(arg.data.isInternal).toBe(false)
  })

  it("menandai catatan internal bila kotaknya dicentang", async () => {
    mocks.prismaMock.crmTicket.findFirst.mockResolvedValueOnce({ id: 7 })
    mocks.prismaMock.crmTicketComment.create.mockResolvedValueOnce({ id: 56 })

    await actions.addTicketComment(7, fdMap({ body: "Catatan untuk tim", isInternal: "on" }))

    const arg = mocks.prismaMock.crmTicketComment.create.mock.calls[0][0]
    expect(arg.data.isInternal).toBe(true)
  })

  it("menolak komentar kosong tanpa menyentuh basis data", async () => {
    for (const body of ["   ", ""]) {
      const res = await actions.addTicketComment(7, fdMap({ body }))
      expect(res.success).toBe(false)
      expect(res.error).toContain("Komentar wajib diisi")
    }
    expect(mocks.prismaMock.crmTicket.findFirst).not.toHaveBeenCalled()
    expect(mocks.prismaMock.crmTicketComment.create).not.toHaveBeenCalled()
  })

  it("menolak tiket yang tidak ada dengan pesan yang terbaca", async () => {
    // findFirst default pada mock mengembalikan null (tiket tidak ada/dihapus).
    const res = await actions.addTicketComment(404, fdMap({ body: "Halo" }))
    expect(res).toEqual({ success: false, error: "Tiket tidak ditemukan" })
    expect(mocks.prismaMock.crmTicketComment.create).not.toHaveBeenCalled()
  })

  it("mencatat jejak audit dan menyegarkan daftar tiket", async () => {
    mocks.prismaMock.crmTicket.findFirst.mockResolvedValueOnce({ id: 7 })
    mocks.prismaMock.crmTicketComment.create.mockResolvedValueOnce({ id: 57 })

    await actions.addTicketComment(7, fdMap({ body: "Selesai" }))

    expect(mocks.logActivityMock).toHaveBeenCalledWith(
      "create",
      "CrmTicketComment",
      57,
      expect.stringContaining("#7"),
    )
    expect(mocks.revalidateMock).toHaveBeenCalledWith("/crm/tickets")
  })

  it("memetakan galat basis data menjadi pesan umum", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.crmTicket.findFirst.mockResolvedValueOnce({ id: 7 })
    mocks.prismaMock.crmTicketComment.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.addTicketComment(7, fdMap({ body: "Halo" }))
    expect(res).toEqual({ success: false, error: "db err" })
  })
})
