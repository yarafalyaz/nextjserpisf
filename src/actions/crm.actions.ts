"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { safeId } from "@/lib/utils/safe-parse"
import { logActivity } from "@/lib/services/activity-log.service"

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
  await logActivity("create", "Ticket", ticket.id, "Membuat tiket")
  return { success: true, id: ticket.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createTicket]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateTicket(id: number, formData: FormData) {
  "use server"

  try {

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
  await logActivity("update", "Ticket", ticket.id, "Memperbarui tiket")
  return { success: true, id: ticket.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateTicket]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
export async function deleteTicket(id: number) {
  "use server"

  try {
  // Fix #22: Add permission check
  await requirePermission("delete_tickets")
  await prisma.crmTicket.delete({ where: { id } })
  revalidatePath("/crm/tickets")
  await logActivity("delete", "Ticket", id, "Menghapus tiket")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteTicket]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteLead(id: number) {
  "use server"

  try {
  // Fix #22: Add permission check
  await requirePermission("delete_leads")
  await prisma.lead.delete({ where: { id } })
  revalidatePath("/crm/leads")
  await logActivity("delete", "Lead", id, "Menghapus lead")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteLead]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
