"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"

// ==================== CRM TICKET ACTIONS ====================

export async function createTicket(formData: FormData) {
  const user = await requirePermission("create_tickets")

  const { generateDocumentNumber } = await import("@/lib/utils/document-number")
  const ticketNumber = await generateDocumentNumber("TKT", "simple")

  const ticket = await prisma.crmTicket.create({
    data: {
      ticketNumber,
      subject: formData.get("subject") as string,
      description: formData.get("description") as string | null,
      customerId: safeId(formData.get("customerId")),
      customerName: formData.get("customerName") as string | null,
      customerEmail: formData.get("customerEmail") as string | null,
      customerPhone: formData.get("customerPhone") as string | null,
      type: formData.get("type") as string | null,
      priority: formData.get("priority") as string || "medium",
      assignedTo: safeId(formData.get("assignedTo")),
      status: "open",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/crm/tickets")
  return { success: true, id: ticket.id }
}


export async function updateTicket(id: number, formData: FormData) {
  "use server"

  // Fix #35: Harusnya edit_tickets, bukan create_tickets
  const user = await requirePermission("edit_tickets")

  const ticket = await prisma.crmTicket.update({
    where: { id },
    data: {
      subject: formData.get("subject") as string,
      description: formData.get("description") as string | null,
      customerId: safeId(formData.get("customerId")),
      customerName: formData.get("customerName") as string | null,
      customerEmail: formData.get("customerEmail") as string | null,
      customerPhone: formData.get("customerPhone") as string | null,
      type: formData.get("type") as string | null,
      priority: formData.get("priority") as string || "medium",
      assignedTo: safeId(formData.get("assignedTo")),
      resolutionNotes: formData.get("resolutionNotes") as string | null,
    },
  })

  revalidatePath("/crm/tickets")
  return { success: true, id: ticket.id }
}
export async function deleteTicket(id: number) {
  "use server"
  // Fix #22: Add permission check
  await requirePermission("delete_tickets")
  await prisma.crmTicket.delete({ where: { id } })
  revalidatePath("/crm/tickets")
  return { success: true }
}

export async function deleteLead(id: number) {
  "use server"
  // Fix #22: Add permission check
  await requirePermission("delete_leads")
  await prisma.lead.delete({ where: { id } })
  revalidatePath("/crm/leads")
  return { success: true }
}
