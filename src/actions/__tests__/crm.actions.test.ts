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
    count: vi.fn().mockResolvedValue(0),
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
    $executeRaw: vi.fn().mockResolvedValue(1),

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
  // Antrean mockResolvedValueOnce/mockRejectedValueOnce tidak dibuang
  // clearAllMocks; reset implementasi dasarnya supaya Once basi dari tes
  // sebelumnya tidak bocor ke tes berikut (reset menghapus antrean juga).
  mocks.prismaMock.crmTicket.update.mockReset()
  mocks.prismaMock.crmTicket.update.mockResolvedValue({})
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, permissions: ["manage_leads", "manage_tickets"], roles: ["super_admin"] })
  // updateTicket membaca baris terkunci dalam tx; default baris hidup supaya
  // tes lama tidak bergantung urutan mockResolvedValueOnce.
  mocks.prismaMock.crmTicket.findUnique.mockResolvedValue({ id: 1, status: "open", firstResponseAt: null, resolvedAt: null, deletedAt: null })
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
  it("createTicket menolak customerId gaib/mati tanpa menulis (putaran 25)", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValue(null)
    const res = await actions.createTicket(fdMap({ subject: "Tiket", customerId: 999999 }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("Pelanggan tidak ditemukan")
    expect(mocks.prismaMock.crmTicket.create).not.toHaveBeenCalled()
  })
  it("updateTicket menolak customerId gaib/mati dari baris terkunci tanpa menulis (putaran 25)", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValue(null)
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", customerId: 999999 }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("Pelanggan tidak ditemukan")
    expect(mocks.prismaMock.crmTicket.update).not.toHaveBeenCalled()
  })
  it("updateTicket mengisi firstResponseAt saat keluar dari open", async () => {
    mocks.prismaMock.crmTicket.findFirst.mockResolvedValueOnce(null)
    mocks.prismaMock.crmTicket.findUnique.mockResolvedValueOnce({ status: "open", firstResponseAt: null, resolvedAt: null })
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", status: "in_progress" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.crmTicket.update.mock.calls[mocks.prismaMock.crmTicket.update.mock.calls.length - 1][0].data
    expect(data.firstResponseAt).toBeInstanceOf(Date)
    // Round4 #8: status aktif (in_progress) selalu mengosongkan resolvedAt.
    expect(data.resolvedAt).toBeNull()
  })
  it("updateTicket mengisi resolvedAt saat resolved", async () => {
    mocks.prismaMock.crmTicket.findFirst.mockResolvedValueOnce(null)
    mocks.prismaMock.crmTicket.findUnique.mockResolvedValueOnce({ status: "in_progress", firstResponseAt: new Date(), resolvedAt: null })
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", status: "resolved" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.crmTicket.update.mock.calls[mocks.prismaMock.crmTicket.update.mock.calls.length - 1][0].data
    expect(data.resolvedAt).toBeInstanceOf(Date)
  })
  it("updateTicket reopen (open/in_progress) mengosongkan resolvedAt", async () => {
    for (const status of ["open", "in_progress"]) {
      mocks.prismaMock.crmTicket.findUnique.mockResolvedValueOnce({ status: "resolved", firstResponseAt: new Date(), resolvedAt: new Date() })
      const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", status }))
      expect(res?.success).toBe(true)
      const data = mocks.prismaMock.crmTicket.update.mock.calls[mocks.prismaMock.crmTicket.update.mock.calls.length - 1][0].data
      expect(data.resolvedAt).toBeNull()
    }
  })
  // Regresi putaran 46: closed adalah status final tiket — reopen dari
  // closed membangkitkan tiket terminal tanpa jejak dan menghapus
  // resolvedAt (SLA dihitung ulang). resolved→open tetap sah (teruji di
  // atas); yang dilarang hanya keluar dari closed.
  it("regresi putaran 46: updateTicket menolak membuka kembali tiket closed", async () => {
    mocks.prismaMock.crmTicket.findUnique.mockResolvedValueOnce({ status: "closed", firstResponseAt: new Date(), resolvedAt: new Date(), deletedAt: null, customerId: null, assignedTo: null })
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", status: "open" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/sudah ditutup final/i)
    expect(mocks.prismaMock.crmTicket.update).not.toHaveBeenCalled()
  })
  it("regresi putaran 46: edit tiket closed dengan status tetap closed tetap boleh", async () => {
    mocks.prismaMock.crmTicket.findUnique.mockResolvedValueOnce({ status: "closed", firstResponseAt: new Date(), resolvedAt: new Date(), deletedAt: null, customerId: null, assignedTo: null })
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket revisi", status: "closed" }))
    expect(res?.success).toBe(true)
  })
  it("putaran 40: updateTicket tak menilai ulang tautan yang tidak berubah", async () => {
    // Customer kini nonaktif, tetapi payload mengirim customerId yang sama
    // dengan baris terkunci — edit subjek/status tidak boleh terkunci.
    mocks.prismaMock.crmTicket.findUnique.mockResolvedValue({
      id: 1, status: "open", firstResponseAt: null, resolvedAt: null, deletedAt: null,
      customerId: 5, assignedTo: null,
    })
    mocks.prismaMock.customer.findFirst.mockResolvedValue(null)
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", customerId: 5 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.customer.findFirst).not.toHaveBeenCalled()
  })
  it("putaran 40: createTicket menolak prioritas di luar low/medium/high", async () => {
    const res = await actions.createTicket(fdMap({ subject: "Tiket", priority: "kritis" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.crmTicket.create).not.toHaveBeenCalled()
  })
  it("putaran 40: updateTicket menolak prioritas di luar low/medium/high", async () => {
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", priority: "urgent" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.crmTicket.update).not.toHaveBeenCalled()
  })
  it("createTicket menolak assignedTo pengguna nonaktif (kolom bare-int tanpa FK)", async () => {
    mocks.prismaMock.user = { findFirst: vi.fn().mockResolvedValue(null) }
    const res = await actions.createTicket(fdMap({ subject: "Tiket", assignedTo: 999 }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("Pengguna penugasan tidak ditemukan atau tidak aktif")
    expect(mocks.prismaMock.crmTicket.create).not.toHaveBeenCalled()
  })
  it("updateTicket menolak assignedTo pengguna nonaktif dalam tx terkunci", async () => {
    mocks.prismaMock.user = { findFirst: vi.fn().mockResolvedValue(null) }
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", assignedTo: 999 }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("Pengguna penugasan tidak ditemukan atau tidak aktif")
    expect(mocks.prismaMock.crmTicket.update).not.toHaveBeenCalled()
  })
  it("updateTicket handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    // Sekali pakai dari tes sebelumnya tidak mengambang (clearAllMocks tidak
    // membuang antrean Once): tetapkan perilaku update untuk tes ini saja.
    mocks.prismaMock.crmTicket.update.mockImplementationOnce(async () => { throw new Error("db err") })
    const res = await actions.updateTicket(1, fdMap({ subject: "Ticket Subject" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateTicket membaca ulang stempel SLA dari baris terkunci dalam tx", async () => {
    // Snapshot luar basi (open) akan menstempel firstResponseAt, tetapi baris
    // terkunci sudah di-soft-delete -> update WAJIB ditolak, update polos
    // tidak boleh terpanggil.
    mocks.prismaMock.$executeRaw = vi.fn().mockResolvedValue(1)
    // Produksi kini membaca baris tepat SATU kali (di dalam tx terkunci):
    // baris terkunci ter-soft-delete -> update WAJIB ditolak.
    mocks.prismaMock.crmTicket.findUnique
      .mockResolvedValueOnce({ status: "open", firstResponseAt: null, resolvedAt: null, deletedAt: new Date() })
    const res = await actions.updateTicket(1, fdMap({ subject: "Tiket", status: "in_progress" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("dihapus")
    expect(mocks.prismaMock.crmTicket.update).not.toHaveBeenCalled()
    const lockSql = (mocks.prismaMock.$executeRaw.mock.calls as unknown[][])
      .map((c) => {
        const first = c[0] as { strings?: string[] } | unknown
        if (Array.isArray(first)) return first.join("?")
        return (first as { strings?: string[] })?.strings?.join("?") ?? ""
      })
      .join(" ")
    expect(lockSql).toContain("crm_tickets")
    const lockOrder = mocks.prismaMock.$executeRaw.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(mocks.prismaMock.crmTicket.update.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER)
  })
  it("deleteTicket succeeds", async () => {
    const res = await actions.deleteTicket(1)
    expect(res?.success).toBe(true)
  })
  it("regression round 19: deleteTicket dengan komentar -> soft-delete, histori tidak cascade-hilang", async () => {
    // CrmTicketComment.ticket onDelete Cascade: hard delete memusnahkan
    // komentar. Baris beranak wajib soft-delete (fallback P2003 tidak
    // pernah terpanggil karena cascade, bukan restrict).
    mocks.prismaMock.crmTicketComment.count.mockResolvedValueOnce(3)
    const res = await actions.deleteTicket(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.crmTicket.delete).not.toHaveBeenCalled()
    const softArg = mocks.prismaMock.crmTicket.update.mock.calls.at(-1)![0]
    expect(softArg.where).toEqual({ id: 1 })
    expect(softArg.data.deletedAt).toBeInstanceOf(Date)
  })
  it("deleteTicket handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.crmTicket.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteTicket(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("putaran 40: deleteTicket mengunci baris tiket sebelum hitung komentar", async () => {
    const res = await actions.deleteTicket(1)
    expect(res?.success).toBe(true)
    const lockCall = mocks.prismaMock.$executeRaw.mock.calls.at(-1)
    expect(String(lockCall?.[0]?.join("?"))).toContain("crm_tickets")
    const lockOrder = mocks.prismaMock.$executeRaw.mock.invocationCallOrder.at(-1)!
    expect(lockOrder).toBeLessThan(mocks.prismaMock.crmTicketComment.count.mock.invocationCallOrder[0])
    expect(lockOrder).toBeLessThan(mocks.prismaMock.crmTicket.delete.mock.invocationCallOrder[0])
  })
})

describe("CRM Lead Actions", () => {
  it("deleteLead succeeds", async () => {
    await expect(actions.deleteLead(1)).rejects.toThrow("NEXT_REDIRECT")
  })
  it("regression round 19: deleteLead dengan aktivitas -> soft-delete, histori tidak cascade-hilang", async () => {
    // LeadActivity.lead onDelete Cascade: hard delete memusnahkan histori
    // aktivitas (laporan churn/follow-up). Baris beranak wajib soft-delete.
    mocks.prismaMock.leadActivity.count.mockResolvedValueOnce(2)
    await expect(actions.deleteLead(1)).rejects.toThrow("NEXT_REDIRECT")
    expect(mocks.prismaMock.lead.delete).not.toHaveBeenCalled()
    const softArg = mocks.prismaMock.lead.update.mock.calls.at(-1)![0]
    expect(softArg.where).toEqual({ id: 1 })
    expect(softArg.data.deletedAt).toBeInstanceOf(Date)
  })
  it("deleteLead handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.lead.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteLead(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("putaran 40: deleteLead mengunci baris lead sebelum hitung aktivitas", async () => {
    await expect(actions.deleteLead(1)).rejects.toThrow("NEXT_REDIRECT")
    const lockCall = mocks.prismaMock.$executeRaw.mock.calls.at(-1)
    expect(String(lockCall?.[0]?.join("?"))).toContain("leads")
    const lockOrder = mocks.prismaMock.$executeRaw.mock.invocationCallOrder.at(-1)!
    expect(lockOrder).toBeLessThan(mocks.prismaMock.leadActivity.count.mock.invocationCallOrder[0])
    expect(lockOrder).toBeLessThan(mocks.prismaMock.lead.delete.mock.invocationCallOrder[0])
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

  it("convertLead menolak bila status berubah ke lost di dalam tx terkunci", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 3, permissions: ["edit_leads", "manage_leads"], roles: ["admin"] })
    mocks.prismaMock.lead.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "qualified", assignedTo: 7, customerId: null })
      .mockResolvedValueOnce({ id: 1, status: "lost", customerId: null, deletedAt: null })
    const res = await actions.convertLead(1)
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.customer.create).not.toHaveBeenCalled()
  })

  it("convertLead menolak lead terhapus-lembut di dalam tx terkunci", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 3, permissions: ["edit_leads", "manage_leads"], roles: ["admin"] })
    mocks.prismaMock.lead.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "qualified", assignedTo: 7, customerId: null })
      .mockResolvedValueOnce({ id: 1, status: "qualified", customerId: null, deletedAt: new Date() })
    const res = await actions.convertLead(1)
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.customer.create).not.toHaveBeenCalled()
  })

  it("putaran 40: convertLead memakai field kontak dari baris terkunci, bukan snapshot luar", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 3, permissions: ["edit_leads", "manage_leads"], roles: ["admin"] })
    // Snapshot luar tx: kontak lama. Baris terkunci (updateLead konkuren
    // menang duluan): kontak baru — customer wajib lahir dari yang baru.
    mocks.prismaMock.lead.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 1, status: "qualified", assignedTo: 7, customerId: null,
        company: "PT Lama", name: "Lead", contactName: "Budi Lama", email: "lama@x.id", phone: "0800", address: "Jl Lama",
      })
      .mockResolvedValueOnce({
        id: 1, status: "qualified", customerId: null, deletedAt: null,
        company: "PT Baru", name: "Lead", contactName: "Budi Baru", email: "baru@x.id", phone: "0900", address: "Jl Baru",
      })
    const res = await actions.convertLead(1)
    expect(res.success).toBe(true)
    const createArg = mocks.prismaMock.customer.create.mock.calls.at(-1)?.[0]
    expect(createArg.data.name).toBe("PT Baru")
    expect(createArg.data.contactPerson).toBe("Budi Baru")
    expect(createArg.data.email).toBe("baru@x.id")
  })

  it("putaran 40: convertLead menilai ulang kepemilikan dari baris terkunci", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 3, permissions: ["edit_leads"], roles: ["sales"] })
    // Rep 3 pemilik di snapshot luar; lead dipindah ke rep 7 sebelum kunci.
    mocks.prismaMock.lead.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "qualified", assignedTo: 3, customerId: null })
      .mockResolvedValueOnce({ id: 1, status: "qualified", assignedTo: 7, customerId: null, deletedAt: null })
    const res = await actions.convertLead(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/ditugaskan kepada Anda/i)
    expect(mocks.prismaMock.customer.create).not.toHaveBeenCalled()
  })
})

describe("addLeadActivity guard + scheduledAt (round4 #5)", () => {
  beforeEach(() => {
    // Lead hidup milik user sesi (id 1); kasus lain menimpa per tes.
    mocks.prismaMock.lead.findFirst.mockResolvedValue({ id: 1, assignedTo: 1 })
  })
  it("menolak lead tidak ada/terhapus tanpa tulis DB", async () => {
    mocks.prismaMock.lead.findFirst.mockResolvedValueOnce(null)
    const res = await actions.addLeadActivity(404, fdMap({ type: "note", subject: "Catatan" }))
    expect(res).toEqual({ success: false, error: "Lead tidak ditemukan" })
    expect(mocks.prismaMock.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 404, deletedAt: null } }),
    )
    expect(mocks.prismaMock.leadActivity.create).not.toHaveBeenCalled()
  })
  it("menolak non-pemilik tanpa manage_leads/super_admin", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 9, permissions: ["edit_leads"], roles: ["sales"] })
    mocks.prismaMock.lead.findFirst.mockResolvedValueOnce({ id: 1, assignedTo: 3 })
    const res = await actions.addLeadActivity(1, fdMap({ type: "note", subject: "Catatan" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/ditugaskan kepada Anda/i)
    expect(mocks.prismaMock.leadActivity.create).not.toHaveBeenCalled()
  })
  it("pemilik boleh; manage_leads boleh atas lead orang lain", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 3, permissions: ["edit_leads"], roles: ["sales"] })
    mocks.prismaMock.lead.findFirst.mockResolvedValueOnce({ id: 1, assignedTo: 3 })
    const own = await actions.addLeadActivity(1, fdMap({ type: "note", subject: "Catatan" }))
    expect(own?.success).toBe(true)
    // default beforeEach user: manage_leads + super_admin atas assignedTo 1
    const managed = await actions.addLeadActivity(1, fdMap({ type: "note", subject: "Catatan" }))
    expect(managed?.success).toBe(true)
    expect(mocks.prismaMock.leadActivity.create).toHaveBeenCalledTimes(2)
  })
  it("menolak scheduledAt fiktif 2026-02-30 tanpa tulis DB", async () => {
    const res = await actions.addLeadActivity(1, fdMap({ type: "task", subject: "Follow up", scheduledAt: "2026-02-30" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.leadActivity.create).not.toHaveBeenCalled()
  })
  it("menyimpan scheduledAt sah sebagai UTC midnight WIB; absen jadi null", async () => {
    const res = await actions.addLeadActivity(1, fdMap({ type: "task", subject: "Follow up", scheduledAt: "2026-10-20" }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.leadActivity.create.mock.calls[0][0]
    expect(arg.data.scheduledAt).toBeInstanceOf(Date)
    expect(arg.data.scheduledAt.toISOString()).toBe("2026-10-20T00:00:00.000Z")
    const res2 = await actions.addLeadActivity(1, fdMap({ type: "note", subject: "Catatan" }))
    expect(res2?.success).toBe(true)
    const arg2 = mocks.prismaMock.leadActivity.create.mock.calls[1][0]
    expect(arg2.data.scheduledAt).toBeNull()
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

/**
 * F-2026-10-25-008-S — penanda selesai aktivitas lead terjadwal.
 * AC-LC-B1..B5 sisi Backend: completedAt server via klaim atomik, gerbang
 * pemilik pola convertLead, idempoten (completedAt pertama tidak ditimpa),
 * hanya aktivitas berjadwal, batal = completedAt kosong tanpa hapus baris.
 */
describe("completeLeadActivity / reopenLeadActivity (F-2026-10-25-008-S)", () => {
  const pemilik = { id: 3, permissions: ["edit_leads"], roles: ["sales"] }
  const bukanPemilik = { id: 9, permissions: ["edit_leads"], roles: ["sales"] }
  const supervisor = { id: 9, permissions: ["edit_leads", "manage_leads"], roles: ["admin"] }

  function leadMilik(userId: number) {
    mocks.prismaMock.lead.findFirst.mockResolvedValue({ id: 1, assignedTo: userId })
  }

  it("B1: pemilik menandai -> klaim atomik completedAt waktu server + log + revalidate", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce(pemilik)
    leadMilik(3)
    mocks.prismaMock.leadActivity.findFirst.mockResolvedValue({
      id: 5, scheduledAt: new Date("2026-10-20T00:00:00.000Z"), completedAt: null,
    })
    mocks.prismaMock.leadActivity.updateMany.mockResolvedValue({ count: 1 })

    const before = Date.now()
    const res = await actions.completeLeadActivity(1, 5)
    const after = Date.now()

    expect(res).toEqual({ success: true, id: 5 })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_leads")
    const claim = mocks.prismaMock.leadActivity.updateMany.mock.calls[0][0]
    expect(claim.where).toEqual({
      id: 5, leadId: 1, scheduledAt: { not: null }, completedAt: null,
    })
    expect(claim.data.completedAt).toBeInstanceOf(Date)
    expect(claim.data.completedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(claim.data.completedAt.getTime()).toBeLessThanOrEqual(after)
    expect(mocks.logActivityMock).toHaveBeenCalledWith(
      "complete", "LeadActivity", 5, expect.stringContaining("5"),
    )
    expect(mocks.revalidateMock).toHaveBeenCalledWith("/crm/leads")
    expect(mocks.revalidateMock).toHaveBeenCalledWith("/crm/leads/1")
    expect(mocks.prismaMock.lead.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.leadActivity.delete).not.toHaveBeenCalled()
  })

  it("B2: non-pemilik tanpa manage_leads ditolak, tidak ada klaim tulis", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce(bukanPemilik)
    leadMilik(3)

    const res = await actions.completeLeadActivity(1, 5)

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/ditugaskan kepada Anda/i)
    expect(mocks.prismaMock.leadActivity.updateMany).not.toHaveBeenCalled()
    expect(mocks.logActivityMock).not.toHaveBeenCalled()
  })

  it("B2b: supervisor manage_leads boleh menandai aktivitas lead orang lain", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce(supervisor)
    leadMilik(3)
    mocks.prismaMock.leadActivity.findFirst.mockResolvedValue({
      id: 5, scheduledAt: new Date(), completedAt: null,
    })
    mocks.prismaMock.leadActivity.updateMany.mockResolvedValue({ count: 1 })

    const res = await actions.completeLeadActivity(1, 5)

    expect(res).toEqual({ success: true, id: 5 })
  })

  it("B3: tandai dua kali -> completedAt pertama tidak ditimpa, penolakan berpesan", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce(pemilik)
    leadMilik(3)
    mocks.prismaMock.leadActivity.findFirst.mockResolvedValue({
      id: 5, scheduledAt: new Date(), completedAt: new Date("2026-10-21T03:00:00.000Z"),
    })

    const res = await actions.completeLeadActivity(1, 5)

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sudah ditandai selesai/i)
    expect(mocks.prismaMock.leadActivity.updateMany).not.toHaveBeenCalled()
  })

  it("B3b: balapan bersamaan — klaim count 0 = kalah idempoten, tanpa log", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce(pemilik)
    leadMilik(3)
    mocks.prismaMock.leadActivity.findFirst
      .mockResolvedValueOnce({ id: 5, scheduledAt: new Date(), completedAt: null })
      .mockResolvedValueOnce({ id: 5, scheduledAt: new Date(), completedAt: new Date() })
    mocks.prismaMock.leadActivity.updateMany.mockResolvedValue({ count: 0 })

    const res = await actions.completeLeadActivity(1, 5)

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sudah ditandai selesai/i)
    expect(mocks.logActivityMock).not.toHaveBeenCalled()
  })

  it("B4: aktivitas tanpa scheduledAt ditolak, completedAt tidak terisi", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce(pemilik)
    leadMilik(3)
    mocks.prismaMock.leadActivity.findFirst.mockResolvedValue({
      id: 5, scheduledAt: null, completedAt: null,
    })

    const res = await actions.completeLeadActivity(1, 5)

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/terjadwal/i)
    expect(mocks.prismaMock.leadActivity.updateMany).not.toHaveBeenCalled()
  })

  it("lead terhapus / aktivitas lead lain ditolak tanpa klaim", async () => {
    mocks.requirePermissionMock.mockResolvedValue(pemilik)
    mocks.prismaMock.lead.findFirst.mockResolvedValue(null)
    const resDeleted = await actions.completeLeadActivity(1, 5)
    expect(resDeleted.success).toBe(false)
    expect(resDeleted.error).toMatch(/Lead tidak ditemukan/i)

    leadMilik(3)
    mocks.prismaMock.leadActivity.findFirst.mockResolvedValue(null)
    const resMissing = await actions.completeLeadActivity(1, 5)
    expect(resMissing.success).toBe(false)
    expect(resMissing.error).toMatch(/Aktivitas lead tidak ditemukan/i)
    expect(mocks.prismaMock.leadActivity.updateMany).not.toHaveBeenCalled()
  })

  it("B5: batalkan -> completedAt null via klaim bersyarat, baris tidak dihapus", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce(pemilik)
    leadMilik(3)
    mocks.prismaMock.leadActivity.findFirst.mockResolvedValue({
      id: 5, scheduledAt: new Date(), completedAt: new Date(),
    })
    mocks.prismaMock.leadActivity.updateMany.mockResolvedValue({ count: 1 })

    const res = await actions.reopenLeadActivity(1, 5)

    expect(res).toEqual({ success: true, id: 5 })
    const claim = mocks.prismaMock.leadActivity.updateMany.mock.calls[0][0]
    expect(claim.where).toEqual({ id: 5, leadId: 1, completedAt: { not: null } })
    expect(claim.data).toEqual({ completedAt: null })
    expect(mocks.prismaMock.leadActivity.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.leadActivity.deleteMany).not.toHaveBeenCalled()
    expect(mocks.logActivityMock).toHaveBeenCalledWith(
      "reopen", "LeadActivity", 5, expect.any(String),
    )
  })

  it("B5b: batalkan yang belum selesai ditolak; non-pemilik batal juga ditolak", async () => {
    mocks.requirePermissionMock.mockResolvedValue(pemilik)
    leadMilik(3)
    mocks.prismaMock.leadActivity.findFirst.mockResolvedValue({
      id: 5, scheduledAt: new Date(), completedAt: null,
    })
    const res = await actions.reopenLeadActivity(1, 5)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/belum ditandai selesai/i)

    mocks.requirePermissionMock.mockResolvedValueOnce(bukanPemilik)
    const resDenied = await actions.reopenLeadActivity(1, 5)
    expect(resDenied.success).toBe(false)
    expect(resDenied.error).toMatch(/ditugaskan kepada Anda/i)
    expect(mocks.prismaMock.leadActivity.updateMany).not.toHaveBeenCalled()
  })

  it("izin katalog nyata: tanpa edit_leads aksi gagal sebelum sentuh DB", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("Tidak memiliki izin edit_leads"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await actions.completeLeadActivity(1, 5)

    expect(res.success).toBe(false)
    expect(mocks.prismaMock.lead.findFirst).not.toHaveBeenCalled()
    expect(mocks.prismaMock.leadActivity.updateMany).not.toHaveBeenCalled()
  })
})
