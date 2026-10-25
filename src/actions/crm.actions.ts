"use server"

import { Prisma } from "@prisma/client"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { createTicketSchema, updateTicketSchema, leadActivitySchema, ticketCommentSchema, CONVERTIBLE_STATUSES } from "@/lib/validations/crm.schemas"
import { nextSlug } from "@/lib/utils/slug-db"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"

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
      slug: await nextSlug("crmTicket", data.subject || ticketNumber),
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

  const existing = await prisma.crmTicket.findUnique({
    where: { id },
    select: { status: true, firstResponseAt: true, resolvedAt: true },
  })

  const ticket = await prisma.crmTicket.update({
    where: { id },
    data: {
      slug: await nextSlug("crmTicket", data.subject, { excludeId: id }),
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
      // Jejak waktu SLA dihitung di server, bukan dari form: respons pertama
      // saat tiket keluar dari "open", selesai saat masuk resolved/closed.
      // Komentar internal/tindak lanjut (addTicketComment) tidak menyentuhnya —
      // hanya perubahan status yang berarti.
      firstResponseAt:
        existing && existing.status === "open" && data.status && data.status !== "open"
          ? (existing.firstResponseAt ?? new Date())
          : undefined,
      resolvedAt:
        existing && data.status && (data.status === "resolved" || data.status === "closed") && !existing.resolvedAt
          ? new Date()
          : undefined,
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
  redirect("/crm/leads")

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

    // Ownership guard (mirrors updateLead): a sales rep may only convert a lead
    // assigned to them, unless they hold manage_leads / super_admin. Without
    // this, any edit_leads holder could mark another rep's lead "won" and create
    // a customer from it — a cross-owner mutation the update path forbids.
    const isAdmin =
      user.permissions.includes("manage_leads") ||
      user.roles.includes("super_admin")
    if (!isAdmin && lead.assignedTo !== Number(user.id)) {
      return {
        success: false,
        error: "Anda hanya dapat mengonversi lead yang ditugaskan kepada Anda.",
      }
    }

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
      // Lock the lead row + re-check inside the tx (TOCTOU guard): two concurrent
      // convert calls would otherwise both pass the pre-tx customerId check and
      // create duplicate customers. The FOR UPDATE serialises them; the loser
      // sees customerId already set and aborts.
      await tx.$queryRaw`SELECT id FROM leads WHERE id = ${leadId} FOR UPDATE`
      const fresh = await tx.lead.findUniqueOrThrow({
        where: { id: leadId },
        select: { customerId: true },
      })
      if (fresh.customerId) {
        throw new Error("Lead sudah dikonversi menjadi pelanggan.")
      }
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
 * Menambahkan komentar pada tiket CRM.
 *
 * Sebelum ini tabel `crm_ticket_comments` TIDAK punya jalur tulis sama sekali:
 * halaman detail tiket merender `include: { comments: … }` beserta keadaan
 * kosongnya, tetapi tidak ada aksi yang bisa menambahkannya — sebuah daftar yang
 * tidak bisa diisi.
 */
export async function addTicketComment(ticketId: number, formData: FormData) {
  try {
    const user = await requirePermission("edit_tickets")

    const parsed = parseFormData(ticketCommentSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    // Tiket harus ada dan belum dihapus. Tanpa pemeriksaan ini, id yang salah
    // berakhir sebagai galat kunci asing Prisma yang tidak terbaca pemakai.
    const ticket = await prisma.crmTicket.findFirst({
      where: { id: ticketId, deletedAt: null },
      select: { id: true },
    })
    if (!ticket) return { success: false, error: "Tiket tidak ditemukan" }

    const comment = await prisma.crmTicketComment.create({
      data: {
        ticketId,
        // Penulis dari SESI, bukan dari form: kalau id penulis datang dari form,
        // komentar bisa ditulis atas nama orang lain.
        userId: Number(user.id),
        body: v.body,
        isInternal: v.isInternal,
      },
    })

    revalidatePath("/crm/tickets")
    await logActivity(
      "create",
      "CrmTicketComment",
      comment.id,
      `Menambahkan komentar pada tiket #${ticketId}`,
    )
    return { success: true, id: comment.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[addTicketComment]", getErrorMessage(e) || e)
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
        // scheduledAt kini string dateOnly tervalidasi; konversi tengah-malam
        // UTC ala WIB (pola expectedCloseDate) supaya tanggal tak bergantung TZ.
        scheduledAt: v.scheduledAt ? wibDateToUtcMidnight(v.scheduledAt) : null,
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

/**
 * F-2026-10-25-008-S: penanda selesai aktivitas lead terjadwal.
 *
 * `LeadActivity.completedAt` dibaca builder antrean F-037
 * (src/lib/reports/lead-followups.ts) tetapi sebelumnya tidak punya satu pun
 * jalur tulis — aktivitas terjadwal yang sudah dikerjakan tidak pernah keluar
 * dari antrean secara sah. Dua aksi ini menutup lubang itu.
 *
 * Keputusan spec (usulan Business, dijalankan Backend bila Lead belum
 * memutus lain — dicatat eksplisit di PR):
 * - Q-LC-1: tandai/batal tunggal, tanpa alasan wajib, tanpa persetujuan supervisor.
 * - Q-LC-2: gerbang pemilik pola `convertLead` — `edit_leads` + (pemilik lead,
 *   atau `manage_leads`/super_admin).
 * - Q-LC-3: hanya aktivitas ber-`scheduledAt` yang bisa ditandai selesai.
 * - Q-LC-4: klaim atomik `updateMany` bersyarat keadaan asal; pemenang
 *   satu-satunya yang menulis log. `completedAt` = waktu server, klien tidak
 *   mengirim tanggal selesai (BR-LC-01).
 */
export async function completeLeadActivity(leadId: number, activityId: number) {
  try {
    const user = await requirePermission("edit_leads")

    const denied = await assertLeadActivityCompletionGuard(user, leadId, activityId, true)
    if (denied) return denied

    const claim = await prisma.leadActivity.updateMany({
      where: {
        id: activityId,
        leadId,
        scheduledAt: { not: null },
        completedAt: null,
      },
      data: { completedAt: new Date() },
    })
    if (claim.count === 0) {
      return { success: false, error: await leadActivityStateError(activityId, leadId, true) }
    }

    await logActivity(
      "complete",
      "LeadActivity",
      activityId,
      `Menandai selesai aktivitas lead #${activityId}`,
    )
    revalidatePath("/crm/leads")
    revalidatePath(`/crm/leads/${leadId}`)
    return { success: true, id: activityId }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[completeLeadActivity]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * F-2026-10-25-008-S: batalkan penanda selesai aktivitas lead.
 * completedAt dikosongkan (baris TIDAK dihapus); aktivitas yang jadwalnya
 * sudah lewat kembali ke antrean F-037 pada muat berikutnya (BR-LC-06).
 */
export async function reopenLeadActivity(leadId: number, activityId: number) {
  try {
    const user = await requirePermission("edit_leads")

    const denied = await assertLeadActivityCompletionGuard(user, leadId, activityId, false)
    if (denied) return denied

    const claim = await prisma.leadActivity.updateMany({
      where: {
        id: activityId,
        leadId,
        completedAt: { not: null },
      },
      data: { completedAt: null },
    })
    if (claim.count === 0) {
      return { success: false, error: await leadActivityStateError(activityId, leadId, false) }
    }

    await logActivity(
      "reopen",
      "LeadActivity",
      activityId,
      `Membatalkan penanda selesai aktivitas lead #${activityId}`,
    )
    revalidatePath("/crm/leads")
    revalidatePath(`/crm/leads/${leadId}`)
    return { success: true, id: activityId }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[reopenLeadActivity]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

type LeadActivityGuardUser = {
  id: string | number
  permissions: readonly string[]
  roles: readonly string[]
}

/**
 * Penjaga bersama tandai/batal-selesai: lead harus ada & belum terhapus,
 * aktivitas harus milik lead itu, dan pemanggil harus pemilik lead atau
 * pemegang `manage_leads`/super_admin (BR-LC-02, pola convertLead).
 * Mengembalikan hasil penolakan, atau null bila boleh lanjut ke klaim atomik.
 * Keadaan selesai aktual DIPERIKSA klaim updateMany, bukan di sini — cek di
 * sini hanya untuk pesan yang akurat pada jalur umum.
 */
async function assertLeadActivityCompletionGuard(
  user: LeadActivityGuardUser,
  leadId: number,
  activityId: number,
  completing: boolean,
): Promise<{ success: false; error: string } | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true, assignedTo: true },
  })
  if (!lead) return { success: false, error: "Lead tidak ditemukan" }

  const isAdmin =
    user.permissions.includes("manage_leads") || user.roles.includes("super_admin")
  if (!isAdmin && lead.assignedTo !== Number(user.id)) {
    return {
      success: false,
      error: completing
        ? "Anda hanya dapat menandai selesai aktivitas lead yang ditugaskan kepada Anda."
        : "Anda hanya dapat membatalkan penanda selesai aktivitas lead yang ditugaskan kepada Anda.",
    }
  }

  const activity = await prisma.leadActivity.findFirst({
    where: { id: activityId, leadId },
    select: { id: true, scheduledAt: true, completedAt: true },
  })
  if (!activity) return { success: false, error: "Aktivitas lead tidak ditemukan" }
  if (completing) {
    if (!activity.scheduledAt) {
      return {
        success: false,
        error: "Hanya aktivitas lead terjadwal yang dapat ditandai selesai.",
      }
    }
    if (activity.completedAt) {
      return { success: false, error: "Aktivitas lead ini sudah ditandai selesai." }
    }
  } else if (!activity.completedAt) {
    return {
      success: false,
      error: "Aktivitas lead ini belum ditandai selesai.",
    }
  }
  return null
}

/**
 * Pesan sesudah klaim kalah (balapan bersamaan, EC-3): baca ulang keadaan
 * sekali untuk membedakan "sudah selesai" dari "tidak ditemukan". completedAt
 * pertama tidak pernah ditimpa karena klaim bersyarat keadaan asal.
 */
async function leadActivityStateError(
  activityId: number,
  leadId: number,
  completing: boolean,
): Promise<string> {
  const activity = await prisma.leadActivity.findFirst({
    where: { id: activityId, leadId },
    select: { id: true, scheduledAt: true, completedAt: true },
  })
  if (!activity) return "Aktivitas lead tidak ditemukan"
  if (completing) {
    if (activity.completedAt) return "Aktivitas lead ini sudah ditandai selesai."
    if (!activity.scheduledAt) {
      return "Hanya aktivitas lead terjadwal yang dapat ditandai selesai."
    }
    return "Aktivitas lead tidak dapat ditandai selesai."
  }
  if (!activity.completedAt) return "Aktivitas lead ini belum ditandai selesai."
  return "Penanda selesai aktivitas lead tidak dapat dibatalkan."
}
