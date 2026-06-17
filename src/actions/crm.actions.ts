"use server"

import { Prisma } from "@prisma/client"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { createTicketSchema, updateTicketSchema, leadActivitySchema, CONVERTIBLE_STATUSES } from "@/lib/validations/crm.schemas"

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

/**
 * Convert a qualified lead into a Customer. Guards: status must be
 * qualified/proposal/negotiation/won and lead not already converted. Creates the
 * Customer (mapping lead fields), stamps lead.customerId + convertedAt +
 * status="won", and logs a conversion activity — all atomic. Mirrors YaraERP
 * LeadController::convert. (Customer has no `notes` column, so lead.notes is not
 * copied; Lead↔Customer is a raw customerId int, not a Prisma relation.)
 */
export async function convertLead(leadId: number) {
  try {
    const user = await requirePermission("edit_leads")

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })

    if (!(CONVERTIBLE_STATUSES as readonly string[]).includes(lead.status)) {
      return {
        success: false,
        error: "Lead belum dapat dikonversi. Status minimal harus 'qualified'.",
      }
    }
    if (lead.customerId) {
      return { success: false, error: "Lead sudah dikonversi menjadi pelanggan." }
    }

    // Document-number generation opens its own session → run before the tx.
    const { generateDocumentNumber } = await import("@/lib/utils/document-number")
    const code = await generateDocumentNumber("CUST", "simple")

    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          name: lead.company || lead.name,
          contactPerson: lead.contactName ?? lead.name,
          email: lead.email,
          phone: lead.phone,
          address: lead.address,
          code,
          isActive: true,
        },
      })
      await tx.lead.update({
        where: { id: leadId },
        data: { customerId: created.id, convertedAt: new Date(), status: "won" },
      })
      await tx.leadActivity.create({
        data: {
          leadId,
          userId: Number(user.id),
          type: "conversion",
          subject: "Lead dikonversi menjadi pelanggan",
        },
      })
      return created
    })

    await logActivity("convert", "Lead", leadId, "Mengonversi lead menjadi pelanggan")
    revalidatePath("/crm/leads")
    revalidatePath(`/crm/leads/${leadId}`)
    revalidatePath("/master/pelanggan")
    return { success: true, customerId: customer.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[convertLead]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Add a timeline activity (note/call/email/meeting/task) to a lead.
 * Mirrors YaraERP LeadController::addActivity.
 */
export async function addLeadActivity(leadId: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_leads")
    const parsed = parseFormData(leadActivitySchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const activity = await prisma.leadActivity.create({
      data: {
        leadId,
        userId: Number(user.id),
        type: v.type,
        subject: v.subject,
        description: v.description ?? null,
        scheduledAt: v.scheduledAt ?? null,
      },
    })

    revalidatePath(`/crm/leads/${leadId}`)
    await logActivity("create", "LeadActivity", activity.id, "Menambahkan aktivitas lead")
    return { success: true, id: activity.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[addLeadActivity]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
