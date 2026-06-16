"use server"

import { Prisma } from "@prisma/client"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { createTicketSchema, updateTicketSchema } from "@/lib/validations/crm.schemas"

// Soft-delete helper, mirrors the convention in master.actions.ts: try hard
// delete first; if a FK constraint blocks it, fall back to stamping deletedAt.
// Without this fallback, models that have a `deletedAt` column (Ticket, Lead,
// Tax) bypass the soft-delete convention used by every other deletable master
// (Customer/Vendor/Item/Employee/Account) and free the id — a future create
// with the same code silently re-uses the tombstoned record's identity.
async function hardDeleteOrSoftDelete(
  hardDelete: () => Promise<unknown>,
  softDelete: () => Promise<unknown>,
): Promise<void> {
  try {
    await hardDelete();
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2003"
    ) {
      await softDelete();
      return;
    }
    throw e;
  }
}

// ==================== CRM TICKET ACTIONS ====================

export async function createTicket(formData: FormData) {
  try {
  const user = await requirePermission("create_tickets")

  const parsed = parseFormData(createTicketSchema, formData)
  if (!parsed.success) {
    return { success: false, error: parsed.error }
  }
  const data = parsed.data

  const { generateDocumentNumber } = await import("@/lib/utils/document-number")
  const ticketNumber = await generateDocumentNumber("TKT", "simple")

  const ticket = await prisma.crmTicket.create({
    data: {
      ticketNumber,
      subject: data.subject,
      description: data.description ?? null,
      customerId: data.customerId ?? null,
      customerName: data.customerName ?? null,
      customerEmail: data.customerEmail ?? null,
      customerPhone: data.customerPhone ?? null,
      type: data.type ?? null,
      priority: data.priority || "medium",
      assignedTo: data.assignedTo ?? null,
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

  const parsed = parseFormData(updateTicketSchema, formData)
  if (!parsed.success) {
    return { success: false, error: parsed.error }
  }
  const data = parsed.data

  const ticket = await prisma.crmTicket.update({
    where: { id },
    data: {
      subject: data.subject,
      description: data.description ?? null,
      customerId: data.customerId ?? null,
      customerName: data.customerName ?? null,
      customerEmail: data.customerEmail ?? null,
      customerPhone: data.customerPhone ?? null,
      type: data.type ?? null,
      priority: data.priority || "medium",
      // Status preservation: persist the new status when sent. Status updates
      // intentionally fall through to the DB default ("open") when the form
      // omits the field (i.e. a form that doesn't render a Status select).
      status: data.status ?? undefined,
      assignedTo: data.assignedTo ?? null,
      resolutionNotes: data.resolutionNotes ?? null,
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
  // CrmTicket has a deletedAt column; use the same hardDeleteOrSoftDelete
  // convention as Customer/Vendor/Item so a ticket referenced by a comment
  // or audit row soft-deletes instead of FK-erroring the action.
  await hardDeleteOrSoftDelete(
    () => prisma.crmTicket.delete({ where: { id } }),
    () => prisma.crmTicket.update({ where: { id }, data: { deletedAt: new Date() } }),
  )
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
  // Lead has a deletedAt column — soft-delete on FK conflicts to preserve the
  // churn-history report and avoid orphaning converted-lead references.
  await hardDeleteOrSoftDelete(
    () => prisma.lead.delete({ where: { id } }),
    () => prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } }),
  )
  revalidatePath("/crm/leads")
  await logActivity("delete", "Lead", id, "Menghapus lead")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteLead]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
