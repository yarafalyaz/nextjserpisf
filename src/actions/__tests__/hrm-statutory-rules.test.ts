import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for P1-6 statutory rule actions: new rows only, history immutable.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  ruleCreate: vi.fn(),
  ruleFindUniqueOrThrow: vi.fn(),
  ruleUpdate: vi.fn(),
  ruleDelete: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payrollStatutoryRule: {
      create: (...a: unknown[]) => mocks.ruleCreate(...a),
      findUniqueOrThrow: (...a: unknown[]) => mocks.ruleFindUniqueOrThrow(...a),
      update: (...a: unknown[]) => mocks.ruleUpdate(...a),
      delete: (...a: unknown[]) => mocks.ruleDelete(...a),
    },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivity(...a),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: vi.fn(),
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(true),
}))
vi.mock("@/lib/services/notification.service", () => ({
  notifyAdmins: vi.fn(),
  createNotification: vi.fn(),
}))
vi.mock("@/lib/services/email", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("DOC-1"),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))

import {
  createStatutoryRule,
  closeStatutoryRule,
  deleteStatutoryRule,
} from "@/actions/hrm.actions"

function fd(entries: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 1 })
  mocks.ruleCreate.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: 3, ...data }),
  )
  mocks.logActivity.mockResolvedValue(undefined)
})

describe("statutory rule actions (P1-6)", () => {
  it("creates a new effective row", async () => {
    const res = await createStatutoryRule(
      fd({ key: "bpjs_jp_ceiling", value: "11000000", effectiveFrom: "2026-01-01", source: "PP X" }),
    )
    expect(res.success).toBe(true)
    expect(mocks.ruleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: "bpjs_jp_ceiling", value: 11_000_000 }),
      }),
    )
  })

  it("rejects an inverted period", async () => {
    const res = await createStatutoryRule(
      fd({ key: "x", value: "1", effectiveFrom: "2026-02-01", effectiveTo: "2026-01-01" }),
    )
    expect(res.success).toBe(false)
    expect(mocks.ruleCreate).not.toHaveBeenCalled()
  })

  it("closes a row with an end date instead of editing history", async () => {
    mocks.ruleFindUniqueOrThrow.mockResolvedValue({
      id: 1,
      key: "bpjs_jp_ceiling",
      effectiveFrom: new Date("2024-01-01"),
    })
    const res = await closeStatutoryRule(1, fd({ effectiveTo: "2026-01-01" }))
    expect(res.success).toBe(true)
    expect(mocks.ruleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    )
  })

  it("rejects a fictitious close date instead of rolling to March", async () => {
    mocks.ruleFindUniqueOrThrow.mockResolvedValue({
      id: 1,
      key: "bpjs_jp_ceiling",
      effectiveFrom: new Date("2024-01-01"),
    })
    const res = await closeStatutoryRule(1, fd({ effectiveTo: "2026-02-30" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Tanggal tutup tidak valid")
    expect(mocks.ruleUpdate).not.toHaveBeenCalled()
  })

  it("refuses to delete an active/historical row", async () => {
    mocks.ruleFindUniqueOrThrow.mockResolvedValue({
      id: 1,
      key: "bpjs_jp_ceiling",
      effectiveFrom: new Date("2024-01-01"),
    })
    const res = await deleteStatutoryRule(1)
    expect(res.success).toBe(false)
    expect(mocks.ruleDelete).not.toHaveBeenCalled()
  })

  it("allows deleting a future row that never took effect", async () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 2)
    mocks.ruleFindUniqueOrThrow.mockResolvedValue({
      id: 2,
      key: "bpjs_jp_ceiling",
      effectiveFrom: future,
    })
    const res = await deleteStatutoryRule(2)
    expect(res.success).toBe(true)
    expect(mocks.ruleDelete).toHaveBeenCalled()
  })
})
