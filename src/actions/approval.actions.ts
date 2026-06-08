"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"

export async function approveStep(approvalId: number, formData: FormData) {
  await requirePermission("approve_workflows")
  const session = await auth()
  const notes = formData.get("notes") as string | null

  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } } },
  })

  if (!approval) throw new Error("Approval tidak ditemukan")
  if (approval.status !== "pending") throw new Error("Approval sudah diproses")

  const totalSteps = approval.workflow.steps.length

  // Create history entry
  await prisma.approvalHistory.create({
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
    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: "approved",
        finalApprovedBy: session?.user?.id ? Number(session.user.id) : null,
        completedAt: new Date(),
      },
    })
  } else {
    // Advance to next step
    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        currentStep: approval.currentStep + 1,
      },
    })
  }

  await logActivity("approve", "Approval", approvalId, "Menyetujui langkah persetujuan")
  revalidatePath(`/pengaturan/persetujuan/${approvalId}`)
  revalidatePath("/pengaturan/persetujuan")
}

export async function rejectStep(approvalId: number, formData: FormData) {
  await requirePermission("approve_workflows")
  const session = await auth()
  const notes = formData.get("notes") as string | null

  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
  })

  if (!approval) throw new Error("Approval tidak ditemukan")
  if (approval.status !== "pending") throw new Error("Approval sudah diproses")

  // Create history entry
  await prisma.approvalHistory.create({
    data: {
      approvalId: approval.id,
      step: approval.currentStep,
      action: "reject",
      userId: session?.user?.id ? Number(session.user.id) : null,
      notes: notes || null,
    },
  })

  // Set status to rejected
  await prisma.approval.update({
    where: { id: approval.id },
    data: {
      status: "rejected",
      completedAt: new Date(),
    },
  })

  await logActivity("reject", "Approval", approvalId, "Menolak langkah persetujuan")
  revalidatePath(`/pengaturan/persetujuan/${approvalId}`)
  revalidatePath("/pengaturan/persetujuan")
}

// ==================== APPROVAL WORKFLOW CRUD ====================

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { safeJsonParse } from "@/lib/utils/safe-parse"

type WorkflowStepInput = { name?: string; roleId?: number | null; approverType?: string | null }

export async function createApprovalWorkflow(formData: FormData) {
  try {
    await requirePermission("manage_settings")

    const name = (formData.get("name") as string)?.trim()
    const modelType = (formData.get("modelType") as string)?.trim()
    if (!name || !modelType) throw new Error("Nama dan tipe dokumen wajib diisi")

    const steps = (safeJsonParse<WorkflowStepInput[]>(formData.get("steps") as string | null) ?? [])
      .filter((s) => s.roleId || s.approverType || s.name)

    const wf = await prisma.approvalWorkflow.create({
      data: {
        name,
        modelType,
        code: (formData.get("code") as string) || null,
        isActive: formData.get("isActive") !== "false",
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

    const name = (formData.get("name") as string)?.trim()
    const modelType = (formData.get("modelType") as string)?.trim()
    if (!name || !modelType) throw new Error("Nama dan tipe dokumen wajib diisi")

    const steps = (safeJsonParse<WorkflowStepInput[]>(formData.get("steps") as string | null) ?? [])
      .filter((s) => s.roleId || s.approverType || s.name)

    await prisma.$transaction(async (tx) => {
      await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: id } })
      await tx.approvalWorkflow.update({
        where: { id },
        data: {
          name,
          modelType,
          code: (formData.get("code") as string) || null,
          isActive: formData.get("isActive") !== "false",
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
