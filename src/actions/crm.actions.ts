"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ==================== CRM TICKET ACTIONS ====================

export async function createTicket(formData: FormData) {
  const user = await requirePermission("create_tickets")

  const ticket = await prisma.crmTicket.create({
    data: {
      subject: formData.get("subject") as string,
      description: formData.get("description") as string | null,
      customerId: formData.get("customerId") ? Number(formData.get("customerId")) : null,
      priority: formData.get("priority") as string || "medium",
      assignedTo: formData.get("assignedTo") ? Number(formData.get("assignedTo")) : null,
      status: "open",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/crm/tickets")
  return { success: true, id: ticket.id }
}


export async function updateTicket(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_tickets")

  const ticket = await prisma.crmTicket.update({
    where: { id },
    data: {
      subject: formData.get("subject") as string,
      description: formData.get("description") as string | null,
      customerId: formData.get("customerId") ? Number(formData.get("customerId")) : null,
      priority: formData.get("priority") as string || "medium",
      assignedTo: formData.get("assignedTo") ? Number(formData.get("assignedTo")) : null,
      status: "open",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/crm/tickets")
  return { success: true, id: ticket.id }
}
export async function deleteTicket(id: number) {
  "use server"
  await prisma.crmTicket.delete({ where: { id } })
  revalidatePath("/crm/tickets")
  return { success: true }
}

export async function deleteLead(id: number) {
  "use server"
  await prisma.lead.delete({ where: { id } })
  revalidatePath("/crm/leads")
  return { success: true }
}
