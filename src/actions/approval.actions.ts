"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { parseFormData } from "@/lib/validations/parse-form"
import {
  approveStepSchema,
  rejectStepSchema,
  createWorkflowSchema,
  updateWorkflowSchema,
} from "@/lib/validations/approval.schemas"
import { safeJsonParse } from "@/lib/utils/safe-parse"

type WorkflowStepInput = { name?: string; roleId?: number | null; approverType?: string | null }

export async function approveStep(approvalId: number, formData: FormData) {
  try {
  await requirePermission("approve_workflows")
  const session = await auth()

  const parsed = parseFormData(approveStepSchema, formData)
  if (!parsed.success) throw new Error(parsed.error)
  const { notes } = parsed.data

  // Serialize concurrent approve/reject on the same approval. Without the row
  // lock, a double-clicked button or two concurrent approvers both pass the
  // "pending" check and both run currentStep + 1, silently skipping a level.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM approvals WHERE id = ${approvalId} FOR UPDATE`

    const approval = await tx.approval.findUnique({
      where: { id: approvalId },
      include: { workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } } },
    })

    if (!approval) throw new Error("Approval tidak ditemukan")
    if (approval.status !== "pending") throw new Error("Approval sudah diproses")

    const totalSteps = approval.workflow.steps.length

    // Create history entry
    await tx.approvalHistory.create({
      data: {
        approvalId: approval.id,
        step: approval.currentStep,
        action: "approve",
        userId: session?.user?.id ? Number(session.user.id) : null,
        notes: notes || null,
      },
    })

    // If last step, mark as approved
    if (approval.currentStep >= totalSteps) {
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: "approved",
          finalApprovedBy: session?.user?.id ? Number(session.user.id) : null,
          completedAt: new Date(),
        },
      })
    } else {
      // Advance to next step
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          currentStep: approval.currentStep + 1,
        },
      })
    }
  })

  await logActivity("approve", "Approval", approvalId, "Menyetujui langkah persetujuan")
  revalidatePath(`/pengaturan/persetujuan/${approvalId}`)
  revalidatePath("/pengaturan/persetujuan")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[approveStep]", getErrorMessage(e) || e)
    throw e
  }
}

export async function rejectStep(approvalId: number, formData: FormData) {
  try {
  await requirePermission("approve_workflows")
  const session = await auth()

  const parsed = parseFormData(rejectStepSchema, formData)
  if (!parsed.success) throw new Error(parsed.error)
  const { notes } = parsed.data

  // Serialize concurrent approve/reject on the same approval (see approveStep).
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM approvals WHERE id = ${approvalId} FOR UPDATE`

    const approval = await tx.approval.findUnique({
      where: { id: approvalId },
    })

    if (!approval) throw new Error("Approval tidak ditemukan")
    if (approval.status !== "pending") throw new Error("Approval sudah diproses")

    // Create history entry
    await tx.approvalHistory.create({
      data: {
        approvalId: approval.id,
        step: approval.currentStep,
        action: "reject",
        userId: session?.user?.id ? Number(session.user.id) : null,
        notes: notes || null,
      },
    })

    // Set status to rejected
    await tx.approval.update({
      where: { id: approval.id },
      data: {
        status: "rejected",
        completedAt: new Date(),
      },
    })
  })

  await logActivity("reject", "Approval", approvalId, "Menolak langkah persetujuan")
  revalidatePath(`/pengaturan/persetujuan/${approvalId}`)
  revalidatePath("/pengaturan/persetujuan")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[rejectStep]", getErrorMessage(e) || e)
    throw e
  }
}

// ==================== APPROVAL WORKFLOW CRUD ====================

export async function createApprovalWorkflow(formData: FormData) {
  try {
    await requirePermission("manage_settings")

    const parsed = parseFormData(createWorkflowSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const { name, modelType, code, isActive, steps: stepsJson } = parsed.data

    const steps = (safeJsonParse<WorkflowStepInput[]>(stepsJson ?? null) ?? [])
      .filter((s) => s.roleId || s.approverType || s.name)

    const wf = await prisma.approvalWorkflow.create({
      data: {
        name,
        modelType,
        code: code || null,
        isActive: isActive !== false,
        steps: {
          create: steps.map((s, i) => ({
            stepOrder: i + 1,
            name: s.name || `Langkah ${i + 1}`,
            roleId: s.roleId ? Number(s.roleId) : null,
            approverType: s.approverType || null,
          })),
        },
      },
    })

    await logActivity("create", "ApprovalWorkflow", wf.id, `Membuat alur persetujuan ${name}`)
    revalidatePath("/pengaturan/workflow")
    return { success: true, id: wf.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createApprovalWorkflow]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateApprovalWorkflow(id: number, formData: FormData) {
  try {
    await requirePermission("manage_settings")

    const parsed = parseFormData(updateWorkflowSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const { name, modelType, code, isActive, steps: stepsJson } = parsed.data

    const steps = (safeJsonParse<WorkflowStepInput[]>(stepsJson ?? null) ?? [])
      .filter((s) => s.roleId || s.approverType || s.name)

    await prisma.$transaction(async (tx) => {
      await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: id } })
      await tx.approvalWorkflow.update({
        where: { id },
        data: {
          name,
          modelType,
          code: code || null,
          isActive: isActive !== false,
          steps: {
            create: steps.map((s, i) => ({
              stepOrder: i + 1,
              name: s.name || `Langkah ${i + 1}`,
              roleId: s.roleId ? Number(s.roleId) : null,
              approverType: s.approverType || null,
            })),
          },
        },
      })
    })

    await logActivity("update", "ApprovalWorkflow", id, `Memperbarui alur persetujuan ${name}`)
    revalidatePath("/pengaturan/workflow")
    return { success: true, id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateApprovalWorkflow]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteApprovalWorkflow(id: number) {
  try {
    await requirePermission("manage_settings")
    await prisma.approvalWorkflow.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    await logActivity("delete", "ApprovalWorkflow", id, "Menghapus alur persetujuan")
    revalidatePath("/pengaturan/workflow")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteApprovalWorkflow]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
