"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"
import { generateDocumentNumber } from "@/lib/utils/document-number"

// ==================== PROJECT ACTIONS ====================

export async function createProject(formData: FormData) {
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
}

export async function updateProject(projectId: number, formData: FormData) {
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
}

// ==================== DELETE ACTIONS ====================

export async function deleteProject(id: number) {
  await requirePermission("delete_projects")

  await prisma.project.delete({ where: { id } })

  revalidatePath("/proyek")
  return { success: true }
}

// ==================== TASK ACTIONS ====================

export async function createTask(formData: FormData) {
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
}

export async function updateTask(formData: FormData) {
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
}

export async function deleteTask(id: number) {
  await requirePermission("delete_projects")

  await prisma.task.delete({ where: { id } })

  revalidatePath("/proyek/tugas")
  return { success: true }
}
