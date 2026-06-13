import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, name: "Test" }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _avg: { progress: 50 }, _sum: { weight: 100 } }),
  })

  const prismaMock: any = {
    project: buildModelMock(),
    projectStage: buildModelMock(),
    task: buildModelMock(),
    systemSetting: buildModelMock(),
    item: buildModelMock(),

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

import * as actions from "../project.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, permissions: ["manage_projects"], roles: ["super_admin"] })
})

describe("Project Actions", () => {
  it("createProject succeeds", async () => {
    const res = await actions.createProject(fdMap({ customerId: 1, name: "Test Project", value: "1000" }))
    expect(res?.success).toBe(true)
  })
  it("updateProject succeeds", async () => {
    const res = await actions.updateProject(1, fdMap({ customerId: 1, name: "Test Project", value: "1000", status: "draft" }))
    expect(res?.success).toBe(true)
  })
  it("deleteProject succeeds", async () => {
    mocks.prismaMock.project.findUnique.mockResolvedValue({
      id: 1,
      _count: { workOrders: 0, timesheets: 0, tasks: 0, overtimeRequests: 0 }
    })
    const res = await actions.deleteProject(1)
    expect(res?.success).toBe(true)
  })
  it("initializeProjectStages succeeds", async () => {
    const res = await actions.initializeProjectStages(1)
    expect(res?.success).toBe(true)
  })
  it("updateProjectStageProgress succeeds", async () => {
    mocks.prismaMock.projectStage.findUniqueOrThrow.mockResolvedValue({ id: 1, projectId: 1, sortOrder: 1 })
    mocks.prismaMock.projectStage.findFirst.mockResolvedValue(null) // previous completed
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, workOrderId: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([])
    const res = await actions.updateProjectStageProgress(1, 1, "in_progress", "Notes")
    expect(res?.success).toBe(true)
  })
  it("syncProjectStatus succeeds", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, workOrderId: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([])
    const res = await actions.syncProjectStatus(1)
    expect(res).toBeUndefined() // returns void
  })
  it("getProjectProgress succeeds", async () => {
    const res = await actions.getProjectProgress(1)
    expect(res?.success).toBe(true)
  })
  it("getProjectStageProgress succeeds", async () => {
    const res = await actions.getProjectStageProgress(1)
    expect(res?.success).toBe(true)
  })
})

describe("Task Actions", () => {
  it("createTask succeeds", async () => {
    const res = await actions.createTask(fdMap({ projectId: 1, name: "Task 1", status: "pending" }))
    expect(res?.success).toBe(true)
  })
  it("updateTask succeeds", async () => {
    const res = await actions.updateTask(fdMap({ id: 1, projectId: 1, name: "Task 1", status: "pending" }))
    expect(res?.success).toBe(true)
  })
  it("deleteTask succeeds", async () => {
    const res = await actions.deleteTask(1)
    expect(res?.success).toBe(true)
  })
})