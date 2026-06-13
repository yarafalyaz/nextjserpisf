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
    workOrder: buildModelMock(),
    workOrderItem: buildModelMock(),
    materialIssue: buildModelMock(),

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

describe("Project Actions Error Paths", () => {
  it("createProject fails validation", async () => {
    const res = await actions.createProject(fdMap({ customerId: 1, name: "" }))
    expect(res?.success).toBe(false)
  })
  it("createProject handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.project.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createProject(fdMap({ customerId: 1, name: "Test Project", value: "1000" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateProject fails validation", async () => {
    const res = await actions.updateProject(1, fdMap({ customerId: 1, name: "" }))
    expect(res?.success).toBe(false)
  })
  it("updateProject handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.project.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateProject(1, fdMap({ customerId: 1, name: "Test Project", value: "1000" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("deleteProject handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.project.findUnique.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteProject(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("initializeProjectStages handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.projectStage.findMany.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.initializeProjectStages(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateProjectStageProgress handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.projectStage.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateProjectStageProgress(1, 1, "in_progress")
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("createTask fails validation", async () => {
    const res = await actions.createTask(fdMap({ projectId: 1, name: "" }))
    expect(res?.success).toBe(false)
  })
  it("createTask handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.task.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createTask(fdMap({ projectId: 1, name: "T1", type: "regular" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateTask fails validation", async () => {
    const res = await actions.updateTask(fdMap({ projectId: 1, name: "" }))
    expect(res?.success).toBe(false)
  })
  it("updateTask handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.task.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateTask(fdMap({ id: 1, projectId: 1, name: "T1", type: "regular" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("deleteTask handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.task.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteTask(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})

describe("Project Stages Extended Branches", () => {
  it("updateProjectStageProgress rejects invalid status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.projectStage.findUniqueOrThrow.mockResolvedValue({ id: 1, projectId: 1, sortOrder: 1 })
    const res = await actions.updateProjectStageProgress(1, 1, "invalid_status")
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak valid")
  })
  it("updateProjectStageProgress rejects wrong project id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.projectStage.findUniqueOrThrow.mockResolvedValue({ id: 1, projectId: 99, sortOrder: 1 })
    const res = await actions.updateProjectStageProgress(1, 1, "in_progress")
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Stage tidak ditemukan")
  })
  it("updateProjectStageProgress blocks start if previous stage incomplete", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.projectStage.findUniqueOrThrow.mockResolvedValue({ id: 2, projectId: 1, sortOrder: 2 })
    mocks.prismaMock.projectStage.findFirst.mockResolvedValue({ id: 1, name: "Persiapan" }) // previous incomplete
    const res = await actions.updateProjectStageProgress(1, 2, "in_progress")
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("belum selesai")
  })
  it("updateProjectStageProgress throws in catch (db err on prisma.stage.update)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.projectStage.findUniqueOrThrow.mockResolvedValue({ id: 1, projectId: 1, sortOrder: 1 })
    mocks.prismaMock.projectStage.findFirst.mockResolvedValue(null)
    mocks.prismaMock.projectStage.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateProjectStageProgress(1, 1, "completed")
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("getProjectStageProgress handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.projectStage.findMany.mockResolvedValueOnce([])
    mocks.prismaMock.projectStage.findMany.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.getProjectStageProgress(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("getProjectProgress returns 0% when no tasks", async () => {
    mocks.prismaMock.task.count.mockResolvedValueOnce(0)
    const res = await actions.getProjectProgress(1)
    expect(res?.success).toBe(true)
    expect(res?.percentage).toBe(0)
    expect(res?.totalTasks).toBe(0)
  })
  it("syncProjectStatus syncs linked WorkOrder (all completed + material issued)", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, workOrderId: 99 })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { status: "completed" }, { status: "completed" }
    ])
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue({ id: 1 })
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.workOrder.update).toHaveBeenCalled()
  })
  it("syncProjectStatus syncs linked WorkOrder to in_progress (in_progress branch)", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "active", workOrderId: 99 })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { status: "in_progress" }, { status: "pending" }
    ])
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue({ id: 99, status: "pending" })
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.workOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "in_progress" })
    }))
  })
  it("syncProjectStatus sets completed when all stages completed", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, workOrderId: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { status: "completed" }, { status: "completed" }
    ])
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "completed" })
    }))
  })
  it("syncProjectStatus sets in_progress when some stages completed/in_progress", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "pending", workOrderId: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { status: "completed" }, { status: "pending" }
    ])
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "in_progress" })
    }))
  })
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
  it("deleteProject fails if has dependents", async () => {
    mocks.prismaMock.project.findUnique.mockResolvedValue({
      id: 1, _count: { workOrders: 1, timesheets: 0, tasks: 0, overtimeRequests: 0 }
    })
    const res = await actions.deleteProject(1)
    expect(res?.success).toBe(false)
  })
  it("deleteProject fails if not found", async () => {
    mocks.prismaMock.project.findUnique.mockResolvedValue(null)
    const res = await actions.deleteProject(1)
    expect(res?.success).toBe(false)
  })
  it("initializeProjectStages skips if already exists", async () => {
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([{ id: 1 }])
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
  it("getProjectProgress handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.task.count.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.getProjectProgress(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("getProjectProgress succeeds", async () => {
    mocks.prismaMock.task.count.mockResolvedValueOnce(10) // total
    mocks.prismaMock.task.count.mockResolvedValueOnce(5)  // completed
    const res = await actions.getProjectProgress(1)
    expect(res?.success).toBe(true)
    expect(res?.percentage).toBe(50)
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
  it("updateTask succeeds (not assigned to non-manager user)", async () => {
    mocks.prismaMock.task.findUniqueOrThrow.mockResolvedValue({ id: 1, assignedTo: 1 })
    const res = await actions.updateTask(fdMap({ id: 1, projectId: 1, name: "Task 1", status: "pending" }))
    expect(res?.success).toBe(true)
  })
  it("updateTask rejects when not assigned and not manager", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockResolvedValue({ id: 99, permissions: [], roles: ["staff"] })
    mocks.prismaMock.task.findUniqueOrThrow.mockResolvedValue({ id: 1, assignedTo: 7 })
    const res = await actions.updateTask(fdMap({ id: 1, projectId: 1, name: "Task 1", status: "pending" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("ditugaskan kepada Anda")
  })
  it("deleteTask succeeds", async () => {
    const res = await actions.deleteTask(1)
    expect(res?.success).toBe(true)
  })
})