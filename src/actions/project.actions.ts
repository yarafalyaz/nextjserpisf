"use server"

import { requireAuth, requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"
import { generateDocumentNumber } from "@/lib/utils/document-number"

// ==================== PROJECT ACTIONS ====================

export async function createProject(formData: FormData) {
  try {
  const user = await requirePermission("create_projects")
  const documentNo = await generateDocumentNumber("PRJ")

  const project = await prisma.project.create({
    data: {
      name: formData.get("name") as string,
      documentNo,
      description: (formData.get("description") as string) || null,
      customerId: requireId(formData.get("customerId"), "customerId"),
      customerVehicleId: safeNumber(formData.get("customerVehicleId")),
      workOrderId: safeNumber(formData.get("workOrderId")),
      startDate: formData.get("startDate") ? new Date(formData.get("startDate") as string) : null,
      endDate: formData.get("endDate") ? new Date(formData.get("endDate") as string) : null,
      notes: formData.get("notes") as string | null,
      status: "active",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/proyek")
  return { success: true, id: project.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createProject]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateProject(projectId: number, formData: FormData) {
  try {
  await requirePermission("edit_projects")

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      customerId: requireId(formData.get("customerId"), "customerId"),
      customerVehicleId: safeNumber(formData.get("customerVehicleId")),
      workOrderId: safeNumber(formData.get("workOrderId")),
      startDate: formData.get("startDate") ? new Date(formData.get("startDate") as string) : null,
      endDate: formData.get("endDate") ? new Date(formData.get("endDate") as string) : null,
      notes: formData.get("notes") as string | null,
    },
  })

  revalidatePath("/proyek")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateProject]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteProject(id: number) {
  try {
  await requirePermission("delete_projects")

  await prisma.project.delete({ where: { id } })

  revalidatePath("/proyek")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteProject]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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

  revalidatePath("/proyek")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[initializeProjectStages]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
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
  const updateData: Record<string, any> = { status }
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

  revalidatePath("/proyek")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateProjectStageProgress]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

/**
 * Auto-update project status based on stage completion.
 * Also syncs linked WorkOrder status.
 * Parity with Laravel: ProjectStageProgressController@updateProjectProgress
 */
export async function syncProjectStatus(projectId: number) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  const stages = await prisma.projectStage.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  })
  if (stages.length === 0) return

  const total = stages.length
  const completed = stages.filter((s) => s.status === "completed").length
  const inProgress = stages.filter((s) => s.status === "in_progress").length

  let projectStatus = project.status

  if (completed === total) {
    // All stages completed → project + WO done
    projectStatus = "completed"
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", endDate: new Date() },
    })
    // Sync linked WorkOrder
    if (project.workOrderId) {
      await prisma.workOrder.update({
        where: { id: project.workOrderId },
        data: { status: "completed", endDate: new Date() },
      })
      await prisma.workOrderItem.updateMany({
        where: { workOrderId: project.workOrderId },
        data: { status: "completed" },
      })
    }
  } else if (inProgress > 0 || completed > 0) {
    // Some stages in progress or completed
    if (project.status === "active" || project.status === "pending") {
      projectStatus = "in_progress"
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
  const totalTasks = await prisma.task.count({ where: { projectId } })
  if (totalTasks === 0) {
    return { success: true, percentage: 0, totalTasks: 0, completedTasks: 0 }
  }

  const completedTasks = await prisma.task.count({
    where: { projectId, status: "completed" },
  })

  const percentage = Math.round((completedTasks / totalTasks) * 100)

  return { success: true, percentage, totalTasks, completedTasks }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[getProjectProgress]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

/**
 * Get stage progress for a specific project with status labels.
 * Parity with Laravel: ProjectStageProgressController@index
 */
export async function getProjectStageProgress(projectId: number) {
  try {
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

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[getProjectStageProgress]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== TASK ACTIONS ====================

export async function createTask(formData: FormData) {
  try {
  await requirePermission("create_projects")

  const task = await prisma.task.create({
    data: {
      projectId: requireId(formData.get("projectId"), "projectId"),
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      status: (formData.get("status") as string) || "pending",
      assignedTo: safeNumber(formData.get("assignedTo")),
      startDate: formData.get("startDate") ? new Date(formData.get("startDate") as string) : null,
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
    },
  })

  revalidatePath("/proyek/tugas")
  return { success: true, id: task.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createTask]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateTask(formData: FormData) {
  try {
  await requirePermission("edit_projects")

  const id = requireId(formData.get("id"), "id")

  await prisma.task.update({
    where: { id },
    data: {
      projectId: requireId(formData.get("projectId"), "projectId"),
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      status: (formData.get("status") as string) || "pending",
      assignedTo: safeNumber(formData.get("assignedTo")),
      startDate: formData.get("startDate") ? new Date(formData.get("startDate") as string) : null,
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
    },
  })

  revalidatePath("/proyek/tugas")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateTask]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteTask(id: number) {
  try {
  await requirePermission("delete_projects")

  await prisma.task.delete({ where: { id } })

  revalidatePath("/proyek/tugas")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteTask]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}
