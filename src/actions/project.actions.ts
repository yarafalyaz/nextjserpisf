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
