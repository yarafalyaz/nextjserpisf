"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { safeId } from "@/lib/utils/safe-parse"

// ==================== CRM TICKET ACTIONS ====================

export async function createTicket(formData: FormData) {
  try {
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

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createTicket]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}


export async function updateTicket(id: number, formData: FormData) {
  try {
  "use server"

  // Fix #35: Harusnya edit_tickets, bukan create_tickets
  await requirePermission("edit_tickets")

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

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateTicket]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}
export async function deleteTicket(id: number) {
  try {
  "use server"
  // Fix #22: Add permission check
  await requirePermission("delete_tickets")
  await prisma.crmTicket.delete({ where: { id } })
  revalidatePath("/crm/tickets")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteTicket]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteLead(id: number) {
  try {
  "use server"
  // Fix #22: Add permission check
  await requirePermission("delete_leads")
  await prisma.lead.delete({ where: { id } })
  revalidatePath("/crm/leads")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteLead]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}
