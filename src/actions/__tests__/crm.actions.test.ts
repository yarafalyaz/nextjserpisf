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
