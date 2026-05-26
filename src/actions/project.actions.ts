"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ==================== PROJECT ACTIONS ====================

export async function createProject(formData: FormData) {
  const user = await requirePermission("create_projects")

  const project = await prisma.project.create({
    data: {
      name: formData.get("name") as string,
      customerId: Number(formData.get("customerId")),
      startDate: formData.get("startDate") ? new Date(formData.get("startDate") as string) : null,
      endDate: formData.get("endDate") ? new Date(formData.get("endDate") as string) : null,
      notes: formData.get("notes") as string | null,
      status: "active",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/projects")
  return { success: true, id: project.id }
}

export async function updateProject(projectId: number, formData: FormData) {
  await requirePermission("edit_projects")

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: formData.get("name") as string,
      customerId: Number(formData.get("customerId")),
      startDate: formData.get("startDate") ? new Date(formData.get("startDate") as string) : null,
      endDate: formData.get("endDate") ? new Date(formData.get("endDate") as string) : null,
      notes: formData.get("notes") as string | null,
    },
  })

  revalidatePath("/projects")
  return { success: true }
}

// ==================== DELETE ACTIONS ====================

export async function deleteProject(id: number) {
  await requirePermission("delete_projects")

  await prisma.project.delete({ where: { id } })

  revalidatePath("/projects")
  return { success: true }
}
