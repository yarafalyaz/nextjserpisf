"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { logActivity } from "@/lib/services/activity-log.service"
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

/**
 * Initialize default project stages for a project.
 * Parity with Laravel: Project->initializeStages()
 */
export async function initializeProjectStages(projectId: number) {
  try {
  await requirePermission("edit_projects")
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
  revalidatePath("/proyek")
  return { success: true }

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
    updateData.startedAt = new Date()
  }
  if (status === "completed") {
    updateData.completedAt = new Date()
  }
  if (notes !== undefined) {
    updateData.notes = notes
  }

  await prisma.projectStage.update({
    where: { id: stageId },
    data: updateData,
  })

  // Auto-update project + WO status
  await syncProjectStatus(projectId)

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
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  const stages = await prisma.projectStage.findMany({
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


  if (completed === total) {
    // All stages completed → project + WO done
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", endDate: new Date() },
    })
    // Sync linked WorkOrder — only auto-complete it if its materials were actually
    // issued (a completed Material Issue exists), mirroring completeWorkOrder's
    // guard. Otherwise leave the WO open; the project can still be marked completed.
    if (project.workOrderId) {
      const issuedMi = await prisma.materialIssue.findFirst({
        where: { workOrderId: project.workOrderId, status: "completed" },
        select: { id: true },
      })
      if (issuedMi) {
        await prisma.workOrder.update({
          where: { id: project.workOrderId },
          data: { status: "completed", endDate: new Date() },
        })
        await prisma.workOrderItem.updateMany({
          where: { workOrderId: project.workOrderId },
          data: { status: "completed" },
        })
      }
    }
  } else if (inProgress > 0 || completed > 0) {
    // Some stages in progress or completed
    if (project.status === "active" || project.status === "pending") {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "in_progress" },
      })
    }
    // Sync linked WorkOrder to in_progress if still pending
    if (project.workOrderId) {
      const wo = await prisma.workOrder.findUnique({ where: { id: project.workOrderId } })
      if (wo && (wo.status === "pending" || wo.status === "draft")) {
        await prisma.workOrder.update({
          where: { id: project.workOrderId },
          data: { status: "in_progress" },
        })
        await prisma.workOrderItem.updateMany({
          where: { workOrderId: project.workOrderId, status: "pending" },
          data: { status: "in_progress" },
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

  const totalTasks = await prisma.task.count({ where: { projectId } })
  if (totalTasks === 0) {
    return { success: true, percentage: 0, totalTasks: 0, completedTasks: 0 }
  }

  const completedTasks = await prisma.task.count({
    where: { projectId, status: "completed" },
  })

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
  // Auto-initialize if needed
  await initializeProjectStages(projectId)

  const stages = await prisma.projectStage.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  })

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
