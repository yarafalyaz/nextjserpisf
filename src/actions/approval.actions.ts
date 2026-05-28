"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { revalidatePath } from "next/cache"

export async function approveStep(approvalId: number, formData: FormData) {
  const user = await requirePermission("view_dashboard")
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

  revalidatePath(`/settings/approvals/${approvalId}`)
  revalidatePath("/pengaturan/persetujuan")
}

export async function rejectStep(approvalId: number, formData: FormData) {
  const user = await requirePermission("view_dashboard")
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

  revalidatePath(`/settings/approvals/${approvalId}`)
  revalidatePath("/pengaturan/persetujuan")
}
