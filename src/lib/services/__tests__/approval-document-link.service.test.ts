import { describe, it, expect, vi, beforeEach } from "vitest"
import { resolveApprovalDocumentLinks } from "../approval-document-link.service"

const mocks = vi.hoisted(() => ({
  findManyApproval: vi.fn(),
  findManyJournal: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    approval: { findMany: mocks.findManyApproval },
    journal: { findMany: mocks.findManyJournal },
  },
}))

describe("resolveApprovalDocumentLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resolves notification to source document href", async () => {
    mocks.findManyApproval.mockResolvedValue([
      {
        id: 4,
        slug: "journal-2",
        referenceType: "Journal",
        referenceId: 64,
      },
    ])
    mocks.findManyJournal.mockResolvedValue([
      {
        id: 64,
        slug: "009-jrn-iro-10-2026",
      },
    ])

    const notifs = [
      {
        id: 10,
        body: "Jurnal 009/JRN/IRO/10/2026 menunggu persetujuan langkah 1. Buka /pengaturan/persetujuan/journal-2",
      },
    ]

    const result = await resolveApprovalDocumentLinks(notifs)
    expect(result.get(10)).toBe("/keuangan/jurnal/009-jrn-iro-10-2026")
  })

  it("returns empty map when no approval links present", async () => {
    const notifs = [{ id: 1, body: "Stok oli menipis" }]
    const result = await resolveApprovalDocumentLinks(notifs)
    expect(result.size).toBe(0)
    expect(mocks.findManyApproval).not.toHaveBeenCalled()
  })
})
