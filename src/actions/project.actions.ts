"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { logActivity } from "@/lib/services/activity-log.service"
import { computeProjectStatus } from "@/lib/services/project-status"
import { requestApprovalIfConfigured, assertApproved } from "@/lib/services/approval-workflow.service"
import type { TxClient } from "@/lib/db/prisma"
import { parseFormData } from "@/lib/validations/parse-form"
import { nextSlug } from "@/lib/utils/slug-db"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import {
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  projectLogSchema,
  projectBudgetItemSchema,
  projectBudgetItemUpdateSchema,
  manualContractSchema,
  budgetRevisionProposalSchema,
} from "@/lib/validations/project.schemas"
import type { Prisma } from "@prisma/client"
import {
  evaluateBudgetLock,
  type ProjectBudgetItemInput,
} from "@/lib/reports/project-budget"

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
      slug: await nextSlug("project", data.name || documentNo),
      name: data.name,
      documentNo,
      description: data.description ?? null,
      customerId: data.customerId,
      customerVehicleId: data.customerVehicleId ?? null,
      workOrderId: data.workOrderId ?? null,
      costCenterId: data.costCenterId ?? null,
      startDate: data.startDate ? wibDateToUtcMidnight(data.startDate) : null,
      endDate: data.endDate ? wibDateToUtcMidnight(data.endDate) : null,
      notes: data.notes ?? null,
      status: "active",
      createdBy: Number(user.id),
    },
  })

  // Auto-initialize default project stages
  await doInitializeProjectStages(project.id)

  await logActivity("create", "Project", project.id, "Membuat proyek")
  await requestApprovalIfConfigured("Project", project.id, Number(user.id));
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

  // Approval workflow gate: if a Project approval workflow is configured,
  // it must be fully approved before allowing edits.
  await assertApproved("Project", projectId)

  await prisma.project.update({
    where: { id: projectId },
    data: {
      slug: await nextSlug("project", data.name, { excludeId: projectId }),
      name: data.name,
      description: data.description ?? null,
      customerId: data.customerId,
      customerVehicleId: data.customerVehicleId ?? null,
      // workOrderId tidak punya input di form proyek (ia tautan sistem dari alur
      // perintah kerja), jadi menulis `?? null` menghapus tautan itu setiap kali
      // proyek disimpan — dan sinkronisasi status WO bergantung pada kolom ini.
      // Hanya tulis bila payload memang memuatnya.
      ...(data.workOrderId !== undefined ? { workOrderId: data.workOrderId } : {}),
      // Cost center must be written here too: the edit form renders the
      // "Pusat Biaya" select (project-form.tsx) and the create path already
      // persists it. Omitting it made the change silently no-op while the UI
      // reported success, which also corrupted profit-center reporting.
      costCenterId: data.costCenterId ?? null,
      startDate: data.startDate ? wibDateToUtcMidnight(data.startDate) : null,
      endDate: data.endDate ? wibDateToUtcMidnight(data.endDate) : null,
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
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    throw new Error("Project tidak valid")
  }

  let initialized = false
  await prisma.$transaction(async (tx) => {
    // Lock the parent row so concurrent page loads cannot both observe an
    // empty stage list and insert duplicate defaults.
    const projectRows = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE
    `
    if (projectRows.length === 0) throw new Error("Project tidak ditemukan")

    const existingStages = await tx.projectStage.findMany({ where: { projectId } })
    if (existingStages.length > 0) return

    const settings = await tx.systemSetting.findFirst()
    const stageNames = settings?.defaultProjectStages
      ? settings.defaultProjectStages.split(",").map((s) => s.trim()).filter(Boolean)
      : ["Persiapan", "Pengerjaan", "Quality Check", "Selesai"]
    const defaultStages = stageNames.length > 0
      ? stageNames
      : ["Persiapan", "Pengerjaan", "Quality Check", "Selesai"]

    await tx.projectStage.createMany({
      data: defaultStages.map((name, index) => ({
        projectId,
        name,
        sortOrder: index + 1,
        status: "pending",
      })),
    })
    initialized = true
  })

  if (!initialized) return { success: true, message: "Stages already initialized" }

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
  notes?: string,
  percentage?: number
) {
  try {
  const user = await requirePermission("edit_projects")

  if (percentage !== undefined) {
    if (typeof percentage !== "number" || percentage < 0 || percentage > 100 || Number.isNaN(percentage)) {
      throw new Error("Persentase progres harus berupa angka antara 0 dan 100.")
    }
  }

  const stage = await prisma.projectStage.findUniqueOrThrow({
    where: { id: stageId },
  })

  if (stage.projectId !== projectId) {
    throw new Error("Stage tidak ditemukan pada project ini.")
  }

  let targetStatus = status
  if (percentage === 100 && targetStatus !== "skipped") {
    targetStatus = "completed"
  }

  const validStatuses = ["pending", "in_progress", "completed", "skipped"]
  if (!validStatuses.includes(targetStatus)) {
    throw new Error(`Status '${targetStatus}' tidak valid. Gunakan: ${validStatuses.join(", ")}`)
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

  if (previousStage && targetStatus !== "pending") {
    throw new Error(
      `Tahap '${previousStage.name}' belum selesai. Selesaikan tahap sebelumnya terlebih dahulu.`
    )
  }

  // Set timestamps based on status transition
  const updateData: Record<string, unknown> = { status: targetStatus }
  let calculatedPercentage = 0

  if (targetStatus === "in_progress") {
    if (!stage.startedAt) {
      updateData.startedAt = new Date()
    }
    updateData.completedAt = null
    calculatedPercentage = percentage !== undefined ? percentage : 50
  } else if (targetStatus === "completed") {
    if (!stage.startedAt) {
      updateData.startedAt = new Date()
    }
    updateData.completedAt = new Date()
    calculatedPercentage = 100
  } else if (targetStatus === "pending") {
    updateData.startedAt = null
    updateData.completedAt = null
    calculatedPercentage = 0
  } else if (targetStatus === "skipped") {
    updateData.completedAt = new Date()
    calculatedPercentage = 100
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

    // Create a progress record inside transaction
    await tx.projectStageProgress.create({
      data: {
        projectStageId: stageId,
        percentage: calculatedPercentage,
        notes: notes ?? null,
        createdBy: Number(user.id),
      },
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
      slug: await nextSlug("task", data.name),
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? "pending",
      assignedTo: data.assignedTo ?? null,
      startDate: data.startDate ? wibDateToUtcMidnight(data.startDate) : null,
      dueDate: data.dueDate ? wibDateToUtcMidnight(data.dueDate) : null,
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
      slug: await nextSlug("task", data.name, { excludeId: data.id }),
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
      status: data.status ?? "pending",
      assignedTo: data.assignedTo ?? null,
      startDate: data.startDate ? wibDateToUtcMidnight(data.startDate) : null,
      dueDate: data.dueDate ? wibDateToUtcMidnight(data.dueDate) : null,
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

/**
 * Menambahkan entri log aktivitas pada proyek.
 *
 * Sebelum ini tabel `project_logs` tidak punya jalur tulis sama sekali: tab "Log"
 * di halaman proyek merender 10 log terakhir beserta keadaan kosongnya, tetapi
 * tidak ada yang bisa menuliskannya — log proyek selalu kosong.
 *
 * Penulis (`userId`) diambil dari SESI, bukan dari form: kalau datang dari form,
 * entri log bisa dibuat atas nama orang lain, dan seluruh gunanya sebagai jejak
 * aktivitas proyek hilang.
 */
export async function addProjectLog(projectId: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_projects")

    const parsed = parseFormData(projectLogSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    // Proyek harus ada. Tanpa pemeriksaan ini, id yang salah berakhir sebagai
    // galat kunci asing Prisma yang tidak terbaca pemakai.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    })
    if (!project) return { success: false, error: "Proyek tidak ditemukan" }

    const log = await prisma.projectLog.create({
      data: {
        projectId,
        action: v.action,
        notes: v.notes ?? null,
        userId: Number(user.id),
      },
    })

    revalidatePath("/proyek")
    await logActivity("create", "ProjectLog", log.id, `Menambahkan log proyek #${projectId}`)
    return { success: true, id: log.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[addProjectLog]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PROJECT BUDGET (RAB) F-2026-10-21-030 ====================
//
// Kontrak + baris RAB + kunci + revisi. Aturan bisnis BR-RAB-030-01..17
// (spec t_132a1a93) sesuai vonis Lead t_3e892715 #86:
// - contractAmount = snapshot SEKALI salin dari Quotation.grandTotal
//   terpilih (BR-01) atau manual ber-alasan (BR-04); bukan hitung ulang.
// - Sesudah budgetLockedAt terisi, edit langsung baris/kontrak DITOLAK
//   server untuk SEMUA role termasuk manage_projects/super_admin (BR-03)
//   — perubahan hanya lewat revisi: ajukan (log rab_revision_proposed,
//   angka belum berubah) -> setujui (satu transaksi terapkan + log
//   rab_revision berisi lama->baru + budgetRevisionNo+1) / tolak
//   (log rab_revision_rejected, nol perubahan angka).
// - Kunci hanya manage_projects dengan prasyarat BR-02 (penjaga murni
//   evaluateBudgetLock) dan ditolak untuk proyek completed (BR-13).
// Aktor selalu dari sesi (requirePermission), tidak pernah dari form.

const CONTRACT_QUOTATION_STATUSES = ["accepted", "approved", "converted"] as const

const LOCKED_BUDGET_ERROR =
  "Anggaran proyek ini sudah terkunci — perubahan hanya dapat dilakukan lewat revisi RAB yang disetujui."

type BudgetItemData = {
  itemId?: number
  projectStageId?: number
  category?: string
  description?: string
  qty: number
  cost: number
  sortOrder?: number
}

function toBudgetItemData(data: BudgetItemData) {
  return {
    itemId: data.itemId ?? null,
    projectStageId: data.projectStageId ?? null,
    category: data.category ?? null,
    description: data.description ?? null,
    qty: data.qty,
    cost: data.cost,
    sortOrder: data.sortOrder ?? 0,
  }
}

async function assertBudgetStageBelongsToProject(
  tx: TxClient,
  projectId: number,
  projectStageId: number | null | undefined,
) {
  if (projectStageId === null || projectStageId === undefined) return
  const stage = await tx.projectStage.findUnique({
    where: { id: projectStageId },
    select: { projectId: true },
  })
  if (!stage || stage.projectId !== projectId) {
    throw new Error("Tahap RAB tidak ditemukan pada proyek ini.")
  }
}

async function loadBudgetProject(tx: TxClient, projectId: number) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      contractAmount: true,
      contractQuotationId: true,
      budgetLockedAt: true,
      budgetRevisionNo: true,
    },
  })
  if (!project) throw new Error("Proyek tidak ditemukan")
  return project
}

function assertBudgetUnlocked(project: { budgetLockedAt: Date | null }) {
  if (project.budgetLockedAt !== null) throw new Error(LOCKED_BUDGET_ERROR)
}

type RevisionChange =
  | { type: "create"; data: BudgetItemData }
  | { type: "update"; projectItemId: number; data: BudgetItemData }
  | { type: "delete"; projectItemId: number }

interface RevisionPayload {
  changes: RevisionChange[]
  contractAmount?: number
  contractQuotationId?: number | null
}

function parseRevisionPayload(raw: string): RevisionPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Format perubahan revisi tidak valid (bukan JSON).")
  }
  const obj = (parsed ?? {}) as Record<string, unknown>
  const rawChanges = Array.isArray(obj.changes) ? obj.changes : null
  if (!rawChanges || rawChanges.length === 0) {
    throw new Error("Perubahan revisi wajib memuat minimal satu perubahan baris atau kontrak.")
  }
  const changes: RevisionChange[] = rawChanges.map((entry, index) => {
    const change = (entry ?? {}) as Record<string, unknown>
    const dataRaw = (change.data ?? {}) as Record<string, unknown>
    const data: BudgetItemData = {
      itemId: typeof dataRaw.itemId === "number" ? dataRaw.itemId : undefined,
      projectStageId:
        typeof dataRaw.projectStageId === "number" ? dataRaw.projectStageId : undefined,
      category: typeof dataRaw.category === "string" ? dataRaw.category : undefined,
      description:
        typeof dataRaw.description === "string" ? dataRaw.description : undefined,
      qty: typeof dataRaw.qty === "number" ? dataRaw.qty : Number.NaN,
      cost: typeof dataRaw.cost === "number" ? dataRaw.cost : Number.NaN,
      sortOrder: typeof dataRaw.sortOrder === "number" ? dataRaw.sortOrder : undefined,
    }
    if (change.type === "create") {
      if (!(data.qty > 0) || !(data.cost >= 0)) {
        throw new Error(`Perubahan revisi #${index + 1}: qty harus > 0 dan biaya satuan >= 0.`)
      }
      return { type: "create", data }
    }
    if (change.type === "update" || change.type === "delete") {
      if (typeof change.projectItemId !== "number") {
        throw new Error(`Perubahan revisi #${index + 1}: projectItemId wajib berupa angka.`)
      }
      if (change.type === "update" && (!(data.qty > 0) || !(data.cost >= 0))) {
        throw new Error(`Perubahan revisi #${index + 1}: qty harus > 0 dan biaya satuan >= 0.`)
      }
      return change.type === "update"
        ? { type: "update", projectItemId: change.projectItemId, data }
        : { type: "delete", projectItemId: change.projectItemId }
    }
    throw new Error(`Perubahan revisi #${index + 1}: tipe perubahan tidak dikenal.`)
  })
  const hasContractChange =
    typeof obj.contractAmount === "number" || "contractQuotationId" in obj
  if (!hasContractChange && changes.length === 0) {
    throw new Error("Perubahan revisi wajib memuat minimal satu perubahan baris atau kontrak.")
  }
  return {
    changes,
    contractAmount: typeof obj.contractAmount === "number" ? obj.contractAmount : undefined,
    contractQuotationId:
      typeof obj.contractQuotationId === "number"
        ? obj.contractQuotationId
        : obj.contractQuotationId === null
          ? null
          : undefined,
  }
}

export async function setProjectContractFromQuotation(
  projectId: number,
  quotationId: number,
) {
  try {
    const user = await requirePermission("edit_projects")
    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      const project = await loadBudgetProject(tx, projectId)
      assertBudgetUnlocked(project)
      const quotation = await tx.quotation.findFirst({
        where: {
          id: quotationId,
          projectId,
          deletedAt: null,
          status: { in: [...CONTRACT_QUOTATION_STATUSES] },
        },
        select: { id: true, documentNo: true, grandTotal: true },
      })
      if (!quotation) {
        throw new Error(
          "Quotation sumber kontrak tidak ditemukan pada proyek ini atau belum disetujui (accepted/approved/converted).",
        )
      }
      await tx.project.update({
        where: { id: projectId },
        data: {
          contractAmount: quotation.grandTotal,
          contractQuotationId: quotation.id,
          contractSetAt: now,
          contractSetBy: Number(user.id),
        },
      })
      await tx.projectLog.create({
        data: {
          projectId,
          action: "rab_contract_snapshot",
          notes: `Snapshot kontrak dari quotation ${quotation.documentNo}`,
          details: {
            contractAmount: {
              old: project.contractAmount !== null ? Number(project.contractAmount) : null,
              new: Number(quotation.grandTotal),
            },
            contractQuotationId: { old: project.contractQuotationId, new: quotation.id },
          } as Prisma.InputJsonValue,
          userId: Number(user.id),
        },
      })
      return { contractAmount: Number(quotation.grandTotal) }
    })
    revalidatePath("/proyek")
    return { success: true, ...result }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[setProjectContractFromQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function setProjectContractManual(projectId: number, formData: FormData) {
  try {
    const parsed = parseFormData(manualContractSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const user = await requirePermission("edit_projects")
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const project = await loadBudgetProject(tx, projectId)
      assertBudgetUnlocked(project)
      await tx.project.update({
        where: { id: projectId },
        data: {
          contractAmount: parsed.data.contractAmount,
          contractQuotationId: null,
          contractSetAt: now,
          contractSetBy: Number(user.id),
        },
      })
      await tx.projectLog.create({
        data: {
          projectId,
          action: "rab_contract_manual",
          notes: parsed.data.reason,
          details: {
            contractAmount: {
              old: project.contractAmount !== null ? Number(project.contractAmount) : null,
              new: parsed.data.contractAmount,
            },
            contractQuotationId: { old: project.contractQuotationId, new: null },
            source: "manual",
            reason: parsed.data.reason,
          } as Prisma.InputJsonValue,
          userId: Number(user.id),
        },
      })
    })
    revalidatePath("/proyek")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[setProjectContractManual]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function createProjectBudgetItem(projectId: number, formData: FormData) {
  try {
    const parsed = parseFormData(projectBudgetItemSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    await requirePermission("edit_projects")
    const item = await prisma.$transaction(async (tx) => {
      const project = await loadBudgetProject(tx, projectId)
      assertBudgetUnlocked(project)
      await assertBudgetStageBelongsToProject(tx, projectId, parsed.data.projectStageId)
      return tx.projectItem.create({
        data: { projectId, ...toBudgetItemData(parsed.data) },
      })
    })
    revalidatePath("/proyek")
    return { success: true, id: item.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createProjectBudgetItem]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateProjectBudgetItem(formData: FormData) {
  try {
    const parsed = parseFormData(projectBudgetItemUpdateSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    await requirePermission("edit_projects")
    await prisma.$transaction(async (tx) => {
      const item = await tx.projectItem.findUnique({
        where: { id: parsed.data.id },
        select: { id: true, projectId: true },
      })
      if (!item) throw new Error("Baris RAB tidak ditemukan")
      const project = await loadBudgetProject(tx, item.projectId)
      assertBudgetUnlocked(project)
      await assertBudgetStageBelongsToProject(tx, item.projectId, parsed.data.projectStageId)
      await tx.projectItem.update({
        where: { id: parsed.data.id },
        data: toBudgetItemData(parsed.data),
      })
    })
    revalidatePath("/proyek")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateProjectBudgetItem]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteProjectBudgetItem(itemId: number) {
  try {
    await requirePermission("edit_projects")
    await prisma.$transaction(async (tx) => {
      const item = await tx.projectItem.findUnique({
        where: { id: itemId },
        select: { id: true, projectId: true },
      })
      if (!item) throw new Error("Baris RAB tidak ditemukan")
      const project = await loadBudgetProject(tx, item.projectId)
      assertBudgetUnlocked(project)
      await tx.projectItem.delete({ where: { id: itemId } })
    })
    revalidatePath("/proyek")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteProjectBudgetItem]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function lockProjectBudget(projectId: number) {
  try {
    const user = await requirePermission("manage_projects")
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE
      `
      if (rows.length === 0) throw new Error("Proyek tidak ditemukan")
      const project = await loadBudgetProject(tx, projectId)
      const [items, stages] = await Promise.all([
        tx.projectItem.findMany({
          where: { projectId },
          select: {
            id: true,
            projectStageId: true,
            category: true,
            qty: true,
            cost: true,
            sortOrder: true,
          },
        }),
        tx.projectStage.findMany({
          where: { projectId },
          select: { id: true, name: true, sortOrder: true, status: true },
        }),
      ])
      const derivedStatus =
        stages.length > 0
          ? computeProjectStatus(stages, project.status, null, now).status
          : project.status
      const itemInputs: ProjectBudgetItemInput[] = items.map((item) => ({
        id: item.id,
        projectStageId: item.projectStageId,
        category: item.category,
        qty: Number(item.qty),
        cost: Number(item.cost),
        sortOrder: item.sortOrder,
      }))
      const failures = evaluateBudgetLock(
        {
          contractAmount:
            project.contractAmount !== null ? Number(project.contractAmount) : null,
          budgetLockedAt: project.budgetLockedAt,
          projectStatus: derivedStatus,
        },
        itemInputs,
        stages,
      )
      if (failures.length > 0) {
        throw new Error(`Anggaran belum dapat dikunci: ${failures.join("; ")}`)
      }
      await tx.project.update({
        where: { id: projectId },
        data: { budgetLockedAt: now, budgetLockedBy: Number(user.id) },
      })
      const totalBudget = itemInputs.reduce(
        (sum, item) => sum + item.qty * item.cost,
        0,
      )
      await tx.projectLog.create({
        data: {
          projectId,
          action: "rab_locked",
          notes: "Anggaran (RAB) proyek dikunci",
          details: {
            budgetRevisionNo: project.budgetRevisionNo,
            totalBudget: Math.round(totalBudget * 100) / 100,
          } as Prisma.InputJsonValue,
          userId: Number(user.id),
        },
      })
    })
    revalidatePath("/proyek")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[lockProjectBudget]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function proposeProjectBudgetRevision(
  projectId: number,
  formData: FormData,
) {
  try {
    const parsed = parseFormData(budgetRevisionProposalSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const user = await requirePermission("edit_projects")
    const payload = parseRevisionPayload(parsed.data.changes)
    const log = await prisma.$transaction(async (tx) => {
      const project = await loadBudgetProject(tx, projectId)
      if (project.budgetLockedAt === null) {
        throw new Error(
          "Anggaran proyek belum terkunci — ubah baris RAB langsung, revisi hanya untuk anggaran terkunci.",
        )
      }
      return tx.projectLog.create({
        data: {
          projectId,
          action: "rab_revision_proposed",
          notes: parsed.data.reason,
          details: {
            changes: payload.changes,
            ...(payload.contractAmount !== undefined
              ? { contractAmount: { new: payload.contractAmount } }
              : {}),
            ...(payload.contractQuotationId !== undefined
              ? { contractQuotationId: { new: payload.contractQuotationId } }
              : {}),
            reason: parsed.data.reason,
          } as Prisma.InputJsonValue,
          userId: Number(user.id),
        },
      })
    })
    revalidatePath("/proyek")
    return { success: true, id: log.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[proposeProjectBudgetRevision]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

async function loadOpenRevisionProposal(tx: TxClient, projectId: number, proposalLogId: number) {
  const proposal = await tx.projectLog.findFirst({
    where: { id: proposalLogId, projectId, action: "rab_revision_proposed" },
    select: { id: true, notes: true, details: true, userId: true },
  })
  if (!proposal) throw new Error("Usulan revisi RAB tidak ditemukan pada proyek ini.")
  const settled = await tx.projectLog.findMany({
    where: { projectId, action: { in: ["rab_revision", "rab_revision_rejected"] } },
    select: { details: true },
  })
  const alreadySettled = settled.some((entry) => {
    const details = (entry.details ?? {}) as Record<string, unknown>
    return details.proposalLogId === proposalLogId
  })
  if (alreadySettled) {
    throw new Error("Usulan revisi RAB ini sudah diputuskan (diterapkan atau ditolak).")
  }
  return proposal
}

export async function applyProjectBudgetRevision(projectId: number, proposalLogId: number) {
  try {
    const user = await requirePermission("manage_projects")
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE
      `
      if (rows.length === 0) throw new Error("Proyek tidak ditemukan")
      const project = await loadBudgetProject(tx, projectId)
      if (project.budgetLockedAt === null) {
        throw new Error("Anggaran proyek belum terkunci — tidak ada revisi untuk diterapkan.")
      }
      const proposal = await loadOpenRevisionProposal(tx, projectId, proposalLogId)
      const details = (proposal.details ?? {}) as Record<string, unknown>
      const payload = parseRevisionPayload(
        JSON.stringify({
          changes: details.changes ?? [],
          ...(typeof (details.contractAmount as Record<string, unknown> | undefined)?.new ===
          "number"
            ? { contractAmount: (details.contractAmount as Record<string, unknown>).new }
            : {}),
          ...("contractQuotationId" in details
            ? {
                contractQuotationId: (
                  details.contractQuotationId as Record<string, unknown>
                ).new,
              }
            : {}),
        }),
      )
      const reason =
        typeof details.reason === "string" ? details.reason : (proposal.notes ?? "")

      const appliedChanges: Record<string, unknown>[] = []
      for (const change of payload.changes) {
        if (change.type === "create") {
          await assertBudgetStageBelongsToProject(tx, projectId, change.data.projectStageId)
          const created = await tx.projectItem.create({
            data: { projectId, ...toBudgetItemData(change.data) },
          })
          appliedChanges.push({
            projectItemId: created.id,
            field: "created",
            old: null,
            new: toBudgetItemData(change.data),
          })
        } else if (change.type === "update") {
          const existing = await tx.projectItem.findFirst({
            where: { id: change.projectItemId, projectId },
          })
          if (!existing) {
            throw new Error(`Baris RAB #${change.projectItemId} tidak ditemukan pada proyek ini.`)
          }
          await assertBudgetStageBelongsToProject(tx, projectId, change.data.projectStageId)
          const next = toBudgetItemData(change.data)
          for (const field of ["itemId", "projectStageId", "category", "description", "qty", "cost", "sortOrder"] as const) {
            const oldValue =
              field === "qty" || field === "cost" ? Number(existing[field]) : existing[field]
            if (oldValue !== next[field]) {
              appliedChanges.push({
                projectItemId: existing.id,
                field,
                old: oldValue,
                new: next[field],
              })
            }
          }
          await tx.projectItem.update({ where: { id: existing.id }, data: next })
        } else {
          const existing = await tx.projectItem.findFirst({
            where: { id: change.projectItemId, projectId },
          })
          if (!existing) {
            throw new Error(`Baris RAB #${change.projectItemId} tidak ditemukan pada proyek ini.`)
          }
          appliedChanges.push({
            projectItemId: existing.id,
            field: "deleted",
            old: {
              itemId: existing.itemId,
              projectStageId: existing.projectStageId,
              category: existing.category,
              description: existing.description,
              qty: Number(existing.qty),
              cost: Number(existing.cost),
              sortOrder: existing.sortOrder,
            },
            new: null,
          })
          await tx.projectItem.delete({ where: { id: existing.id } })
        }
      }

      const revisionNo = project.budgetRevisionNo + 1
      const contractUpdate: Record<string, unknown> = { budgetRevisionNo: revisionNo }
      let contractAmountDetail: Record<string, unknown> | undefined
      if (payload.contractQuotationId !== undefined && payload.contractQuotationId !== null) {
        const quotation = await tx.quotation.findFirst({
          where: {
            id: payload.contractQuotationId,
            projectId,
            deletedAt: null,
            status: { in: [...CONTRACT_QUOTATION_STATUSES] },
          },
          select: { id: true, grandTotal: true },
        })
        if (!quotation) {
          throw new Error(
            "Quotation sumber kontrak revisi tidak ditemukan pada proyek ini atau belum disetujui (accepted/approved/converted).",
          )
        }
        contractUpdate.contractAmount = quotation.grandTotal
        contractUpdate.contractQuotationId = quotation.id
        contractUpdate.contractSetAt = new Date()
        contractUpdate.contractSetBy = Number(user.id)
        contractAmountDetail = {
          old: project.contractAmount !== null ? Number(project.contractAmount) : null,
          new: Number(quotation.grandTotal),
        }
      } else if (payload.contractAmount !== undefined) {
        contractUpdate.contractAmount = payload.contractAmount
        contractUpdate.contractQuotationId =
          payload.contractQuotationId !== undefined ? payload.contractQuotationId : project.contractQuotationId
        contractUpdate.contractSetAt = new Date()
        contractUpdate.contractSetBy = Number(user.id)
        contractAmountDetail = {
          old: project.contractAmount !== null ? Number(project.contractAmount) : null,
          new: payload.contractAmount,
        }
      }
      await tx.project.update({ where: { id: projectId }, data: contractUpdate })

      await tx.projectLog.create({
        data: {
          projectId,
          action: "rab_revision",
          notes: reason || null,
          details: {
            proposalLogId,
            revisionNo,
            changes: appliedChanges,
            ...(contractAmountDetail ? { contractAmount: contractAmountDetail } : {}),
            reason,
          } as Prisma.InputJsonValue,
          userId: Number(user.id),
        },
      })
      return { revisionNo }
    })
    revalidatePath("/proyek")
    return { success: true, revisionNo: result.revisionNo }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[applyProjectBudgetRevision]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function rejectProjectBudgetRevision(
  projectId: number,
  proposalLogId: number,
  formData: FormData,
) {
  try {
    // Penolakan hanya butuh alasan penolak (bukan payload perubahan usulan).
    const reasonRaw = formData.get("reason")
    const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : ""
    if (!reason) return { success: false, error: "Alasan penolakan wajib diisi" }
    const user = await requirePermission("manage_projects")
    await prisma.$transaction(async (tx) => {
      const project = await loadBudgetProject(tx, projectId)
      if (project.budgetLockedAt === null) {
        throw new Error("Anggaran proyek belum terkunci — tidak ada revisi untuk ditolak.")
      }
      await loadOpenRevisionProposal(tx, projectId, proposalLogId)
      await tx.projectLog.create({
        data: {
          projectId,
          action: "rab_revision_rejected",
          notes: reason,
          details: { proposalLogId, reason } as Prisma.InputJsonValue,
          userId: Number(user.id),
        },
      })
    })
    revalidatePath("/proyek")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[rejectProjectBudgetRevision]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
