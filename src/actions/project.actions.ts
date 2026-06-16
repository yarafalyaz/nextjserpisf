"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { logActivity } from "@/lib/services/activity-log.service"
import { computeProjectStatus } from "@/lib/services/project-status"
import type { TxClient } from "@/lib/db/prisma"
import { parseFormData } from "@/lib/validations/parse-form"
import {
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
} from "@/lib/validations/project.schemas"

// ==================== PROJECT ACTIONS ====================

export async function createProject(formData: FormData) {
  try {
  const parsed = parseFormData(createProjectSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  const user = await requirePermission("create_projects")
  const documentNo = await generateDocumentNumber("PRJ")

  const project = await prisma.project.create({
    data: {
      name: data.name,
      documentNo,
      description: data.description ?? null,
      customerId: data.customerId,
      customerVehicleId: data.customerVehicleId ?? null,
      workOrderId: data.workOrderId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      notes: data.notes ?? null,
      status: "active",
      createdBy: Number(user.id),
    },
  })

  await logActivity("create", "Project", project.id, "Membuat proyek")
  revalidatePath("/proyek")
  return { success: true, id: project.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createProject]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateProject(projectId: number, formData: FormData) {
  try {
  const parsed = parseFormData(updateProjectSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  await requirePermission("edit_projects")

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: data.name,
      description: data.description ?? null,
      customerId: data.customerId,
      customerVehicleId: data.customerVehicleId ?? null,
      workOrderId: data.workOrderId ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      notes: data.notes ?? null,
    },
  })

  await logActivity("update", "Project", projectId, "Memperbarui proyek")
  revalidatePath("/proyek")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateProject]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteProject(id: number) {
  try {
  await requirePermission("delete_projects")

  // Integrity guard: refuse to delete a project that still has real
  // cross-module work attached. timesheets.projectId is a required FK
  // (onDelete: Restrict) so a raw delete throws a generic error; workOrders /
  // tasks / overtimeRequests represent logged work/documents that must not
  // vanish silently. (items/stages/logs are project-intrinsic and cascade by
  // design.) Mirrors deleteVehicle's in-use guard.
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      _count: {
        select: { workOrders: true, timesheets: true, tasks: true, overtimeRequests: true },
      },
    },
  })
  if (!project) {
    return { success: false, error: "Proyek tidak ditemukan" }
  }
  const { workOrders, timesheets, tasks, overtimeRequests } = project._count
  const dependents = workOrders + timesheets + tasks + overtimeRequests
  if (dependents > 0) {
    return {
      success: false,
      error:
        "Proyek tidak dapat dihapus karena masih memiliki data terkait " +
        `(work order: ${workOrders}, lembar waktu: ${timesheets}, tugas: ${tasks}, lembur: ${overtimeRequests}). ` +
        "Hapus atau pindahkan data tersebut terlebih dahulu.",
    }
  }

  await prisma.project.delete({ where: { id } })

  await logActivity("delete", "Project", id, "Menghapus proyek")
  revalidatePath("/proyek")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteProject]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PROJECT STAGE PROGRESSION ACTIONS ====================

/**
 * Status labels for project stages.
 */
const STAGE_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  in_progress: "Proses",
  completed: "Selesai",
  skipped: "Dilewati",
}

async function doInitializeProjectStages(projectId: number) {
  const existingStages = await prisma.projectStage.findMany({
    where: { projectId },
  })
  if (existingStages.length > 0) {
    return { success: true, message: "Stages already initialized" }
  }

  await prisma.projectStage.createMany({
    data: [
      { projectId, name: "Persiapan", sortOrder: 1, status: "pending" },
      { projectId, name: "Pengerjaan", sortOrder: 2, status: "pending" },
      { projectId, name: "Quality Check", sortOrder: 3, status: "pending" },
      { projectId, name: "Selesai", sortOrder: 4, status: "pending" },
    ],
  })

  await logActivity("initialize", "ProjectStage", projectId, "Inisialisasi tahapan proyek")
  return { success: true }
}

/**
 * Initialize default project stages for a project.
 * Parity with Laravel: Project->initializeStages()
 */
export async function initializeProjectStages(projectId: number) {
  try {
  await requirePermission("edit_projects")
  
  const res = await doInitializeProjectStages(projectId)
  if (res.success && !res.message) {
    revalidatePath("/proyek")
  }
  return res

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[initializeProjectStages]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Update stage progress with guard: previous stage must be completed.
 * Parity with Laravel: ProjectStageProgressController@update
 */
export async function updateProjectStageProgress(
  projectId: number,
  stageId: number,
  status: string,
  notes?: string
) {
  try {
  await requirePermission("edit_projects")

  const stage = await prisma.projectStage.findUniqueOrThrow({
    where: { id: stageId },
  })

  if (stage.projectId !== projectId) {
    throw new Error("Stage tidak ditemukan pada project ini.")
  }

  const validStatuses = ["pending", "in_progress", "completed", "skipped"]
  if (!validStatuses.includes(status)) {
    throw new Error(`Status '${status}' tidak valid. Gunakan: ${validStatuses.join(", ")}`)
  }

  // Guard: cannot start/complete if previous stage is not completed
  const previousStage = await prisma.projectStage.findFirst({
    where: {
      projectId,
      sortOrder: { lt: stage.sortOrder },
      status: { notIn: ["completed", "skipped"] },
    },
    orderBy: { sortOrder: "desc" },
  })

  if (previousStage && status !== "pending") {
    throw new Error(
      `Tahap '${previousStage.name}' belum selesai. Selesaikan tahap sebelumnya terlebih dahulu.`
    )
  }

  // Set timestamps based on status transition
  const updateData: Record<string, unknown> = { status }
  if (status === "in_progress") {
    if (!stage.startedAt) {
      updateData.startedAt = new Date()
    }
    updateData.completedAt = null
  } else if (status === "completed") {
    if (!stage.startedAt) {
      updateData.startedAt = new Date()
    }
    updateData.completedAt = new Date()
  } else if (status === "pending") {
    updateData.startedAt = null
    updateData.completedAt = null
  } else if (status === "skipped") {
    updateData.completedAt = new Date()
  }
  if (notes !== undefined) {
    updateData.notes = notes
  }

  // ATOMICITY: the stage status flip + the cascading project/WO sync must
  // commit together. Previously the stage update landed and then syncProjectStatus
  // ran as a separate call — a failure in the sync (e.g. transient DB error,
  // a stage row deleted by a concurrent request) would leave the stage marked
  // "completed" while the project header still showed "in_progress" and the WO
  // was still "in_progress" with all items "in_progress", a permanent divergence
  // that no UI affordance repairs. Wrapping both in one tx guarantees the
  // stage status, project status, and WO status all agree on commit.
  // We use the tx-accepting internal helper (syncProjectStatusTx) because
  // Prisma cannot nest $transaction callbacks — calling the public
  // syncProjectStatus inside this tx would open a separate transaction
  // that commits independently, breaking the atomicity we are after.
  await prisma.$transaction(async (tx) => {
    await tx.projectStage.update({
      where: { id: stageId },
      data: updateData,
    })

    // Auto-update project + WO status (in same tx via the TxClient variant)
    await syncProjectStatusTx(projectId, tx)
  })

  await logActivity("update", "ProjectStage", stageId, "Memperbarui progres tahapan proyek")
  revalidatePath("/proyek")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateProjectStageProgress]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Auto-update project status based on stage completion.
 * Also syncs linked WorkOrder status.
 * Parity with Laravel: ProjectStageProgressController@updateProjectProgress
 */
export async function syncProjectStatus(projectId: number) {
  await requirePermission("edit_projects")
  // ATOMICITY: a sync can touch up to 5 tables (project + workOrder +
  // workOrderItem + (in the "all completed" branch) the materialIssue lookup
  // and the WO completion flip). Previously these were sequential non-
  // transactional prisma calls — a mid-sequence failure (e.g. transient DB
  // error) would leave the project marked "completed" but its linked WO still
  // "in_progress" with all items "in_progress", a permanent divergence that
  // no UI affordance repairs. Wrapping all writes in one tx guarantees
  // project + WO + WO items all reflect the same stage state on commit.
  // The materialIssue lookup inside the tx is a SELECT — safe to run inside
  // the same tx body (no state to roll back), and the result is only used to
  // gate the WO update; the in-tx writes are still atomic with each other.
  await prisma.$transaction(async (tx) => {
    await syncProjectStatusTx(projectId, tx)
  })
}

/**
 * Internal helper: same body as syncProjectStatus, but accepts a tx client so
 * callers that already hold a transaction (e.g. updateProjectStageProgress)
 * can join the same atomic unit instead of opening a nested $transaction
 * (Prisma cannot nest $transaction callbacks — the inner one would commit
 * independently and break atomicity).
 */
async function syncProjectStatusTx(projectId: number, tx: TxClient) {
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  const stages = await tx.projectStage.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  })
  if (stages.length === 0) return

  const total = stages.length
  // Fix: a `skipped` stage is a terminal "done" state (mirrors the previous-stage
  // guard in updateProjectStageProgress which allows a stage to start when prior
  // stages are `completed` OR `skipped`). Without counting skipped as done, a
  // project with any skipped stage would never auto-transition to `completed`.
  const completed = stages.filter((s) => s.status === "completed" || s.status === "skipped").length
  const inProgress = stages.filter((s) => s.status === "in_progress").length

  // Project status + endDate decision is delegated to the tested helper so the
  // historical completion date is preserved on re-runs (an already-completed
  // project re-syncing must NOT have its endDate stamped forward — see
  // project-status.ts header).
  const decision = computeProjectStatus(stages, project.status, project.endDate, new Date())

  if (completed === total) {
    // All stages completed → project + WO done
    if (decision.changed) {
      await tx.project.update({
        where: { id: projectId },
        data: { status: decision.status, endDate: decision.endDate },
      })
    }
    // Sync linked WorkOrder — only auto-complete it if its materials were actually
    // issued (a completed Material Issue exists), mirroring completeWorkOrder's
    // guard. Otherwise leave the WO open; the project can still be marked completed.
    if (project.workOrderId) {
      const issuedMi = await tx.materialIssue.findFirst({
        where: { workOrderId: project.workOrderId, status: "completed" },
        select: { id: true },
      })
      if (issuedMi) {
        await tx.workOrder.update({
          where: { id: project.workOrderId },
          data: { status: "completed", endDate: new Date() },
        })
        await tx.workOrderItem.updateMany({
          where: { workOrderId: project.workOrderId },
          data: { status: "completed" },
        })
      }
    }
  } else if (inProgress > 0 || completed > 0) {
    // Some stages in progress or completed
    if (project.status === "active" || project.status === "pending" || project.status === "completed") {
      await tx.project.update({
        where: { id: projectId },
        data: { status: "in_progress", endDate: null },
      })
    }
    // Sync linked WorkOrder to in_progress if still pending or completed
    if (project.workOrderId) {
      const wo = await tx.workOrder.findUnique({ where: { id: project.workOrderId } })
      if (wo && (wo.status === "pending" || wo.status === "draft" || wo.status === "completed")) {
        await tx.workOrder.update({
          where: { id: project.workOrderId },
          data: { status: "in_progress", endDate: null },
        })
        await tx.workOrderItem.updateMany({
          where: { workOrderId: project.workOrderId, status: { in: ["pending", "completed"] } },
          data: { status: "in_progress" },
        })
      }
    }
  } else {
    // All stages pending
    if (project.status === "in_progress" || project.status === "completed") {
      await tx.project.update({
        where: { id: projectId },
        data: { status: "active", endDate: null },
      })
    }
    if (project.workOrderId) {
      const wo = await tx.workOrder.findUnique({ where: { id: project.workOrderId } })
      if (wo && (wo.status === "in_progress" || wo.status === "completed")) {
        await tx.workOrder.update({
          where: { id: project.workOrderId },
          data: { status: "pending", endDate: null },
        })
        await tx.workOrderItem.updateMany({
          where: { workOrderId: project.workOrderId, status: { in: ["in_progress", "completed"] } },
          data: { status: "pending" },
        })
      }
    }
  }
}

/**
 * Get project progress percentage auto-calculated from completed tasks.
 * Returns { percentage, totalTasks, completedTasks }.
 */
export async function getProjectProgress(projectId: number) {
  try {
  await requirePermission("view_projects")

  const taskCounts = await prisma.task.groupBy({
    by: ['status'],
    where: { projectId },
    _count: true,
  })

  const totalTasks = taskCounts.reduce((sum, g) => sum + g._count, 0)
  if (totalTasks === 0) {
    return { success: true, percentage: 0, totalTasks: 0, completedTasks: 0 }
  }

  const completedTasks = taskCounts.find((g) => g.status === "completed")?._count || 0

  const percentage = Math.round((completedTasks / totalTasks) * 100)

  return { success: true, percentage, totalTasks, completedTasks }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[getProjectProgress]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Get stage progress for a specific project with status labels.
 * Parity with Laravel: ProjectStageProgressController@index
 */
export async function getProjectStageProgress(projectId: number) {
  try {
  await requirePermission("view_projects")

  // Read existing stages first; only auto-initialize when the viewer has edit
  // permission. Previously this called `initializeProjectStages` which
  // requires `edit_projects` and silently logged a "Forbidden" error for
  // view-only users, plus it ran an extra findMany on every read.
  let stages = await prisma.projectStage.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  })
  if (stages.length === 0) {
    // Only auto-initialize for users who can edit. Probe the edit permission
    // separately so a genuine DB error during initialization still surfaces
    // (only the permission denial is swallowed, leaving an empty list).
    let canEdit = false
    try {
      await requirePermission("edit_projects")
      canEdit = true
    } catch {
      // view-only user: leave the empty list as-is; no write.
    }
    if (canEdit) {
      await doInitializeProjectStages(projectId)
      stages = await prisma.projectStage.findMany({
        where: { projectId },
        orderBy: { sortOrder: "asc" },
      })
    }
  }

  const progress = stages.map((s) => ({
    id: s.id,
    name: s.name,
    sortOrder: s.sortOrder,
    status: s.status,
    statusLabel: STAGE_STATUS_LABELS[s.status] ?? s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    notes: s.notes,
  }))

  return { success: true, data: progress }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[getProjectStageProgress]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== TASK ACTIONS ====================

export async function createTask(formData: FormData) {
  try {
  const parsed = parseFormData(createTaskSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  await requirePermission("create_projects")

  const task = await prisma.task.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? "pending",
      assignedTo: data.assignedTo ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  })

  await logActivity("create", "Task", task.id, "Membuat tugas")
  revalidatePath("/proyek/tugas")
  return { success: true, id: task.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createTask]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateTask(formData: FormData) {
  try {
  const parsed = parseFormData(updateTaskSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  const actor = await requirePermission("edit_projects")
  const isManager = actor.permissions.includes("manage_projects") || actor.roles.includes("super_admin")

  const existing = await prisma.task.findUniqueOrThrow({ where: { id: data.id } })

  // Security Guard: Staff can only update tasks assigned to them.
  if (!isManager && existing.assignedTo !== Number(actor.id)) {
    throw new Error("Anda hanya dapat memperbarui tugas yang ditugaskan kepada Anda.")
  }

  // Reassignment guard: a non-manager must not be able to sidestep the
  // ownership check by setting assignedTo to themselves (or anyone else)
  // on a task they don't own at read time. The "you can only edit your own
  // tasks" rule would otherwise be bypassable by "claim any task you can
  // see and reassign it to yourself before saving". Managers retain full
  // reassignment rights.
  const isReassigning =
    data.assignedTo !== undefined && data.assignedTo !== existing.assignedTo;
  if (!isManager && isReassigning) {
    throw new Error(
      "Hanya manager / super admin yang dapat mengubah penugasan tugas.",
    );
  }

  await prisma.task.update({
    where: { id: data.id },
    data: {
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? "pending",
      assignedTo: data.assignedTo ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  })

  await logActivity("update", "Task", data.id, "Memperbarui tugas")
  revalidatePath("/proyek/tugas")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateTask]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteTask(id: number) {
  try {
  await requirePermission("delete_projects")

  await prisma.task.delete({ where: { id } })

  await logActivity("delete", "Task", id, "Menghapus tugas")
  revalidatePath("/proyek/tugas")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteTask]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
