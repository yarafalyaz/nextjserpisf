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
  workflowStepsSchema,
} from "@/lib/validations/approval.schemas"
import { safeJsonParse } from "@/lib/utils/safe-parse"

type WorkflowStepInput = { name?: string; roleId?: number | null; userId?: number | null; approverType?: string | null }

/**
 * Parse + Zod-validate the workflow steps JSON blob from formData.
 * Returns `{ steps }` on success or `{ error }` on failure (malformed JSON,
 * oversized blob, roleId not a positive int, name > 255 chars, > 50 steps,
 * etc.). Centralized so create + update share the exact same gate.
 */
function parseWorkflowSteps(stepsJson: string | null | undefined):
  | { ok: true; steps: WorkflowStepInput[] }
  | { ok: false; error: string } {
  if (!stepsJson) return { ok: true, steps: [] }
  const raw = safeJsonParse<unknown>(stepsJson)
  if (raw === null) {
    return { ok: false, error: "Validasi gagal: steps: bukan JSON yang valid" }
  }
  const parsed = workflowStepsSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")
    return { ok: false, error: `Validasi gagal: ${fieldErrors}` }
  }
  return {
    ok: true,
    steps: parsed.data.map((s) => ({
      name: s.name,
      roleId: s.roleId ?? null,
      userId: s.userId ?? null,
      approverType: s.approverType,
    })),
  }
}

// Enforce that the acting user is actually the designated approver for the
// approval's current step. requirePermission("approve_workflows") only gates
// the *capability*; without this, anyone holding it could approve/reject ANY
// step of ANY approval, defeating role/user-scoped multi-level approval.
// super_admin bypasses (consistent with requirePermission). A step with neither
// userId nor roleId (e.g. approverType-only / unrestricted) falls back to the
// permission gate already passed by the caller.
async function assertStepApprover(
  approval: {
    currentStep: number
    workflow: { steps: { stepOrder: number; roleId: number | null; userId: number | null }[] }
  },
  user: { id: string | number; roles: string[] }
): Promise<void> {
  if (user.roles.includes("super_admin")) return
  const stepDef = approval.workflow.steps.find((s) => s.stepOrder === approval.currentStep)
  if (!stepDef) return
  if (stepDef.userId != null) {
    if (Number(user.id) !== stepDef.userId) {
      throw new Error("Forbidden: Anda bukan approver untuk langkah ini.")
    }
    return
  }
  if (stepDef.roleId != null) {
    const role = await prisma.role.findUnique({
      where: { id: stepDef.roleId },
      select: { name: true },
    })
    if (!role || !user.roles.includes(role.name)) {
      throw new Error("Forbidden: Anda bukan approver untuk langkah ini.")
    }
  }
}

export async function approveStep(approvalId: number, formData: FormData) {
  try {
  const user = await requirePermission("approve_workflows")
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

    // Only the designated approver for the current step may approve it.
    await assertStepApprover(approval, user)

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
  const user = await requirePermission("approve_workflows")
  const session = await auth()

  const parsed = parseFormData(rejectStepSchema, formData)
  if (!parsed.success) throw new Error(parsed.error)
  const { notes } = parsed.data

  // Serialize concurrent approve/reject on the same approval (see approveStep).
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM approvals WHERE id = ${approvalId} FOR UPDATE`

    const approval = await tx.approval.findUnique({
      where: { id: approvalId },
      include: { workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } } },
    })

    if (!approval) throw new Error("Approval tidak ditemukan")
    if (approval.status !== "pending") throw new Error("Approval sudah diproses")

    // Only the designated approver for the current step may reject it.
    await assertStepApprover(approval, user)

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

    const stepsResult = parseWorkflowSteps(stepsJson ?? null)
    if (!stepsResult.ok) return { success: false, error: stepsResult.error }
    const steps = stepsResult.steps.filter(
      (s) => s.roleId || s.userId || s.approverType || s.name,
    )

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
            userId: s.userId ? Number(s.userId) : null,
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

    const stepsResult = parseWorkflowSteps(stepsJson ?? null)
    if (!stepsResult.ok) return { success: false, error: stepsResult.error }
    const steps = stepsResult.steps.filter(
      (s) => s.roleId || s.userId || s.approverType || s.name,
    )

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
              userId: s.userId ? Number(s.userId) : null,
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
