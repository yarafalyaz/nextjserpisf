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
vi.mock("@/lib/validations/parse-form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/validations/parse-form")>()
  return {
    parseFormData: vi.fn(actual.parseFormData),
  }
})

import * as actions from "../project.actions"
import { parseFormData } from "@/lib/validations/parse-form"

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

describe("Project Actions Optional-Field Branches", () => {
  it("createProject succeeds with all optional fields populated", async () => {
    const res = await actions.createProject(
      fdMap({
        customerId: 1,
        name: "Full Project",
        description: "A description",
        customerVehicleId: 5,
        workOrderId: 9,
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        notes: "some notes",
      })
    )
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "A description",
          customerVehicleId: 5,
          workOrderId: 9,
          notes: "some notes",
        }),
      })
    )
  })
  it("updateProject succeeds with all optional fields populated", async () => {
    const res = await actions.updateProject(
      1,
      fdMap({
        customerId: 1,
        name: "Full Project",
        description: "A description",
        customerVehicleId: 5,
        workOrderId: 9,
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        notes: "some notes",
      })
    )
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "A description",
          customerVehicleId: 5,
          workOrderId: 9,
          notes: "some notes",
        }),
      })
    )
  })
})

describe("Task Actions Optional-Field Branches", () => {
  it("createTask succeeds with all optional fields populated", async () => {
    const res = await actions.createTask(
      fdMap({
        projectId: 1,
        name: "Full Task",
        description: "task desc",
        status: "in_progress",
        assignedTo: 7,
        startDate: "2026-01-01",
        dueDate: "2026-01-15",
      })
    )
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "task desc",
          status: "in_progress",
          assignedTo: 7,
        }),
      })
    )
  })
  it("createTask handles error in catch (covers createTask catch path)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.task.create.mockRejectedValueOnce(new Error("create boom"))
    const res = await actions.createTask(fdMap({ projectId: 1, name: "Task X" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("create boom")
  })
  it("updateTask succeeds as manager with all optional fields populated", async () => {
    mocks.prismaMock.task.findUniqueOrThrow.mockResolvedValue({ id: 1, assignedTo: 99 })
    const res = await actions.updateTask(
      fdMap({
        id: 1,
        projectId: 2,
        name: "Full Task",
        description: "task desc",
        status: "completed",
        assignedTo: 4,
        startDate: "2026-01-01",
        dueDate: "2026-01-15",
      })
    )
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "task desc",
          status: "completed",
          assignedTo: 4,
        }),
      })
    )
  })
  it("updateTask succeeds for non-manager on own task (manage_projects absent, super_admin absent)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7, permissions: ["edit_projects"], roles: ["staff"] })
    mocks.prismaMock.task.findUniqueOrThrow.mockResolvedValue({ id: 1, assignedTo: 7 })
    const res = await actions.updateTask(fdMap({ id: 1, projectId: 1, name: "Mine", status: "pending" }))
    expect(res?.success).toBe(true)
  })
})

describe("updateProjectStageProgress status-transition branches", () => {
  beforeEach(() => {
    mocks.prismaMock.projectStage.findUniqueOrThrow.mockResolvedValue({ id: 1, projectId: 1, sortOrder: 1 })
    mocks.prismaMock.projectStage.findFirst.mockResolvedValue(null)
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, workOrderId: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([])
  })
  it("sets completedAt when status is completed", async () => {
    const res = await actions.updateProjectStageProgress(1, 1, "completed")
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.projectStage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: expect.any(Date) }) })
    )
  })
  it("does not set timestamps for pending and omits notes when undefined", async () => {
    // previous incomplete but status pending is allowed
    mocks.prismaMock.projectStage.findFirst.mockResolvedValue({ id: 0, name: "Prev" })
    const res = await actions.updateProjectStageProgress(1, 1, "pending")
    expect(res?.success).toBe(true)
    const callArg = mocks.prismaMock.projectStage.update.mock.calls.at(-1)?.[0]
    expect(callArg.data.startedAt).toBeUndefined()
    expect(callArg.data.completedAt).toBeUndefined()
    expect(callArg.data.notes).toBeUndefined()
  })
})

describe("syncProjectStatus extended branches", () => {
  it("all completed but workOrder has no issued material issue -> WO not updated", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, workOrderId: 99 })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([{ status: "completed" }, { status: "completed" }])
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValue(null)
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) })
    )
    expect(mocks.prismaMock.workOrder.update).not.toHaveBeenCalled()
  })
  it("returns early when there are no stages", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, workOrderId: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([])
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.project.update).not.toHaveBeenCalled()
  })
  it("in_progress branch skips project.update when status already in_progress/other and WO not pending/draft", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed", workOrderId: 99 })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([{ status: "in_progress" }, { status: "pending" }])
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue({ id: 99, status: "in_progress" })
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.project.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.workOrder.update).not.toHaveBeenCalled()
  })
  it("in_progress branch syncs WO when status is draft", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "active", workOrderId: 99 })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([{ status: "completed" }, { status: "pending" }])
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue({ id: 99, status: "draft" })
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "in_progress" }) })
    )
  })
  it("in_progress branch where WO lookup returns null (no WO update)", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "active", workOrderId: 99 })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([{ status: "in_progress" }, { status: "pending" }])
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue(null)
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.workOrder.update).not.toHaveBeenCalled()
  })
})

describe("getProjectStageProgress with stage data", () => {
  it("maps stages and falls back to raw status when label missing", async () => {
    // initializeProjectStages call -> findMany returns existing so skip create
    mocks.prismaMock.projectStage.findMany.mockReset()
    mocks.prismaMock.projectStage.findMany
      .mockResolvedValueOnce([{ id: 1 }]) // initializeProjectStages: already exists
      .mockResolvedValueOnce([
        { id: 1, name: "Persiapan", sortOrder: 1, status: "completed", startedAt: null, completedAt: null, notes: null },
        { id: 2, name: "Custom", sortOrder: 2, status: "unknown_status", startedAt: null, completedAt: null, notes: "n" },
      ])
    const res = await actions.getProjectStageProgress(1)
    expect(res?.success).toBe(true)
    expect(res?.data?.[0]?.statusLabel).toBe("Selesai")
    expect(res?.data?.[1]?.statusLabel).toBe("unknown_status")
  })
})

describe("NEXT_REDIRECT Error Catch Paths", () => {
  it("createProject re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.project.create.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_1" })
    await expect(
      actions.createProject(fdMap({ customerId: 1, name: "Test" }))
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_1" })
  })

  it("updateProject re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.project.update.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_2" })
    await expect(
      actions.updateProject(1, fdMap({ customerId: 1, name: "Test" }))
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_2" })
  })

  it("deleteProject re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.project.findUnique.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_3" })
    await expect(
      actions.deleteProject(1)
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_3" })
  })

  it("initializeProjectStages re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.projectStage.findMany.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_4" })
    await expect(
      actions.initializeProjectStages(1)
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_4" })
  })

  it("updateProjectStageProgress re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.projectStage.findUniqueOrThrow.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_5" })
    await expect(
      actions.updateProjectStageProgress(1, 1, "in_progress")
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_5" })
  })

  it("getProjectProgress re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.task.count.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_6" })
    await expect(
      actions.getProjectProgress(1)
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_6" })
  })

  it("getProjectStageProgress re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.projectStage.findMany.mockReset()
    mocks.prismaMock.projectStage.findMany.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_7" })
    await expect(
      actions.getProjectStageProgress(1)
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_7" })
  })

  it("createTask re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.task.create.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_8" })
    await expect(
      actions.createTask(fdMap({ projectId: 1, name: "Test" }))
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_8" })
  })

  it("updateTask re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.task.findUniqueOrThrow.mockResolvedValue({ id: 1, assignedTo: 1 })
    mocks.prismaMock.task.update.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_9" })
    await expect(
      actions.updateTask(fdMap({ id: 1, projectId: 1, name: "Test" }))
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_9" })
  })

  it("deleteTask re-throws NEXT_REDIRECT error", async () => {
    mocks.prismaMock.task.delete.mockRejectedValueOnce({ digest: "NEXT_REDIRECT_10" })
    await expect(
      actions.deleteTask(1)
    ).rejects.toEqual({ digest: "NEXT_REDIRECT_10" })
  })
})

describe("Missing/Default fields coverage", () => {
  it("createTask status defaults to pending if omitted", async () => {
    const f = new FormData()
    f.append("projectId", "1")
    f.append("name", "Default Task")
    // omit status
    const res = await actions.createTask(f)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending",
        }),
      })
    )
  })

  it("updateTask status defaults to pending if omitted", async () => {
    mocks.prismaMock.task.findUniqueOrThrow.mockResolvedValue({ id: 1, assignedTo: 1 })
    const f = new FormData()
    f.append("id", "1")
    f.append("projectId", "1")
    f.append("name", "Default Task")
    // omit status
    const res = await actions.updateTask(f)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending",
        }),
      })
    )
  })

  it("syncProjectStatus handles when inProgress = 0 and completed = 0 (no-op status)", async () => {
    mocks.prismaMock.project.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "active", workOrderId: null })
    mocks.prismaMock.projectStage.findMany.mockResolvedValue([
      { status: "pending" }, { status: "pending" }
    ])
    await actions.syncProjectStatus(1)
    expect(mocks.prismaMock.project.update).not.toHaveBeenCalled()
  })
})

describe("Fallback error message coverage (getErrorMessage(e) || e)", () => {
  const emptyErr = new Error("")
  
  it("createProject fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.createProject(fdMap({ name: "A", customerId: 1 }))
  })
  it("updateProject fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.updateProject(1, fdMap({ name: "A", customerId: 1 }))
  })
  it("deleteProject fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.deleteProject(1)
  })
  it("initializeProjectStages fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.initializeProjectStages(1)
  })
  it("updateProjectStageProgress fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.updateProjectStageProgress(1, 1, "in_progress")
  })
  it("getProjectProgress fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.getProjectProgress(1)
  })
  it("getProjectStageProgress fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.getProjectStageProgress(1)
  })
  it("createTask fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.createTask(fdMap({ name: "A", projectId: 1 }))
  })
  it("updateTask fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.updateTask(fdMap({ id: 1, name: "A", projectId: 1 }))
  })
  it("deleteTask fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValueOnce(emptyErr)
    await actions.deleteTask(1)
  })
})

describe("Task status ?? pending coverage", () => {
  it("createTask with missing status from parser", async () => {
    vi.mocked(parseFormData).mockReturnValueOnce({
      success: true,
      data: { projectId: 1, name: "Task without status" }
    } as any)
    const res = await actions.createTask(new FormData())
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending" }),
      })
    )
  })

  it("updateTask with missing status from parser", async () => {
    mocks.prismaMock.task.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, assignedTo: 1 })
    vi.mocked(parseFormData).mockReturnValueOnce({
      success: true,
      data: { id: 1, projectId: 1, name: "Task without status" }
    } as any)
    const res = await actions.updateTask(new FormData())
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending" }),
      })
    )
  })
})
