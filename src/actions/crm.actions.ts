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
import { nextSlugWithClient } from "@/lib/utils/slug-db"
import { checkIdempotency } from "@/lib/utils/idempotency"
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

/**
 * CrmTicket.customerId bare Int? tanpa relasi Customer: id gaib atau
 * pelanggan ter-soft-delete/nonaktif tersimpan senyap dan detail tiket
 * merender tautan pelanggan hantu. Bila payload memang mengirim
 * customerId, baris pelanggan wajib hidup (pola dokumen baru penjualan).
 */
async function assertTicketCustomerLive(
  client: { customer: { findFirst: typeof prisma.customer.findFirst } },
  customerId: number | null | undefined,
): Promise<void> {
  if (customerId == null) return
  const customer = await client.customer.findFirst({
    where: { id: customerId, deletedAt: null, isActive: true },
    select: { id: true },
  })
  if (!customer) {
    throw new Error("Pelanggan tidak ditemukan, tidak aktif, atau sudah dihapus")
  }
}

/**
 * Lead.assignedTo / CrmTicket.assignedTo bare Int? tanpa relasi User: id
 * gaib/nonaktif tersimpan senyap dan tiket/lead ter-assign ke hantu (tidak
 * ada yang bisa mengerjakannya). Bila payload mengirim assignedTo, pengguna
 * wajib ada dan aktif — User tidak punya deletedAt, isActive status hidupnya.
 */
async function assertAssignedUserLive(
  client: { user: { findFirst: typeof prisma.user.findFirst } },
  assignedTo: number | null | undefined,
): Promise<void> {
  if (assignedTo == null) return
  const user = await client.user.findFirst({
    where: { id: assignedTo, isActive: true },
    select: { id: true },
  })
  if (!user) {
    throw new Error("Pengguna penugasan tidak ditemukan atau tidak aktif")
  }
}

export async function createTicket(formData: FormData) {
  try {
  const user = await requirePermission("create_tickets")

  const parsed = parseFormData(createTicketSchema, formData)
  if (!parsed.success) {
    return { success: false, error: parsed.error }
  }
  const data = parsed.data

  await assertTicketCustomerLive(prisma, data.customerId)
  await assertAssignedUserLive(prisma, data.assignedTo)

  const { generateDocumentNumber } = await import("@/lib/utils/document-number")
  const ticketNumber = await generateDocumentNumber("TKT", "simple")

  const ticket = await prisma.$transaction(async (tx) => {
    await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id)
    // Putaran 67: gerbang hidup dinilai ulang lewat delegate tx — penilaian
    // prá-tx di atas hanya fail-fast; pelanggan/pengguna yang dinonaktifkan
    // antara cek dan commit tak boleh tertulis di kolom bare-int tanpa FK
    // (pola updateTicket baris 178-183).
    await assertTicketCustomerLive(tx, data.customerId)
    await assertAssignedUserLive(tx, data.assignedTo)
    return tx.crmTicket.create({
    data: {
      // Putaran 71: slug lewat delegate tx — varian global tak melihat
      // baris tak-tercommit transaksi lain (CrmTicket.slug @unique).
      slug: await nextSlugWithClient(tx as never, "crmTicket", data.subject || ticketNumber),
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

  // Keputusan SLA dihitung ulang dari baris TERKUNCI di dalam tx (balapan
  // dgn deleteTicket / update lain: snapshot REPEATABLE READ bukan penjaga,
  // dan tiket ter-soft-delete tidak boleh ditulis lagi). Putaran 71: slug
  // dihitung dalam tx lewat delegate tx — varian global pra-tx P2002 mentah
  // pada rename konkuren ke subjek sama (CrmTicket.slug @unique).
  const ticket = await prisma.$transaction(async (tx) => {
    const slug = await nextSlugWithClient(tx as never, "crmTicket", data.subject, {
      excludeId: id,
    })
    await tx.$executeRaw`SELECT id FROM crm_tickets WHERE id = ${id} FOR UPDATE`
    const existing = await tx.crmTicket.findUnique({
      where: { id },
      select: {
        status: true,
        firstResponseAt: true,
        resolvedAt: true,
        closedAt: true,
        deletedAt: true,
        customerId: true,
        assignedTo: true,
      },
    })
    if (!existing) throw new Error("Tiket tidak ditemukan")
    if (existing.deletedAt) throw new Error("Tiket sudah dihapus dan tidak dapat diubah")
    // closed = penutupan final: transisi KELUAR dari closed ditolak agar
    // tiket terminal tidak bangkit tanpa jejak dan resolvedAt (dasar SLA)
    // tidak terhapus. resolved→open/in_progress tetap jalur reopen sah,
    // dan edit field dengan status tetap closed tidak digerbang.
    if (existing.status === "closed" && data.status && data.status !== "closed") {
      throw new Error("Tiket sudah ditutup final dan tidak dapat dibuka kembali. Buat tiket baru untuk isu lanjutan.")
    }
    // Penilaian tautan hanya bila BERPINDAH dari baris terkunci (pola
    // relink putaran 36/38/39): payload update selalu mengirim ulang
    // tautan; menilai selalu mengunci edit tiket selamanya begitu
    // customer/user dinonaktifkan sesudah tiket lahir.
    if ((data.customerId ?? null) !== existing.customerId) {
      await assertTicketCustomerLive(tx, data.customerId)
    }
    if ((data.assignedTo ?? null) !== existing.assignedTo) {
      await assertAssignedUserLive(tx, data.assignedTo)
    }

    return tx.crmTicket.update({
      where: { id },
      data: {
        slug,
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
        // saat tiket keluar dari "open", selesai saat masuk resolved/closed,
        // dikosongkan saat dibuka kembali (open/in_progress). Komentar
        // internal/tindak lanjut (addTicketComment) tidak menyentuhnya.
        firstResponseAt:
          existing.status === "open" && data.status && data.status !== "open"
            ? (existing.firstResponseAt ?? new Date())
            : undefined,
        resolvedAt:
          data.status === "open" || data.status === "in_progress"
            ? null
            : data.status && (data.status === "resolved" || data.status === "closed") && !existing.resolvedAt
              ? new Date()
              : undefined,
        // closedAt sebelumnya yatim (tak pernah ditulis): stempel saat
        // masuk closed, pertahankan cap pertama pada edit tetap-closed.
        // Keluar dari closed sudah ditolak di atas, jadi tak ada jalur
        // pengosongan.
        closedAt:
          data.status === "closed" ? (existing.closedAt ?? new Date()) : undefined,
      },
    })
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
  // CrmTicketComment.ticket ber-onDelete Cascade: hard delete tiket beranak
  // TIDAK memicu P2003 — komentar ikut musnah senyap. Tiket berkomentar
  // langsung soft-delete; hard delete hanya untuk tiket tanpa komentar.
  // Putaran 40: hitungan + putusan di dalam tx berkunci baris tiket, dan
  // addTicketComment mengunci baris yang sama sebelum menulis — komentar
  // tak bisa menyelip di antara hitungan dan delete (cascade-musnah) atau
  // lahir sesudah soft-delete (yatim di tiket tombstone).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM crm_tickets WHERE id = ${id} FOR UPDATE`
    const commentCount = await tx.crmTicketComment.count({ where: { ticketId: id } })
    if (commentCount > 0) {
      await tx.crmTicket.update({ where: { id }, data: { deletedAt: new Date() } })
    } else {
      await hardDeleteOrSoftDelete(
        () => tx.crmTicket.delete({ where: { id } }),
        () => tx.crmTicket.update({ where: { id }, data: { deletedAt: new Date() } }),
      )
    }
  })
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
  const user = await requirePermission("delete_leads")
  // Putaran 71: kepemilikan dinilai dari baris terkunci (pola convertLead
  // baris 387-389) — delete adalah mutasi lead paling destruktif dan
  // satu-satunya tanpa gerbang pemilik; rep berizin delete_leads bisa
  // menghapus lead rep lain termasuk yang sudah terkonversi.
  const isAdmin =
    user.permissions.includes("manage_leads") ||
    user.roles.includes("super_admin")
  // Lead has a deletedAt column — soft-delete on FK conflicts to preserve the
  // churn-history report and avoid orphaning converted-lead references.
  // LeadActivity.lead ber-onDelete Cascade: hard delete lead beraktivitas
  // TIDAK memicu P2003 — histori aktivitas ikut musnah senyap. Lead
  // beraktivitas langsung soft-delete; hard delete hanya tanpa aktivitas.
  // Putaran 40: sama seperti deleteTicket — kunci baris lead dalam tx
  // sebelum hitungan; addLeadActivity mengunci baris yang sama.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM leads WHERE id = ${id} FOR UPDATE`
    if (!isAdmin) {
      const fresh = await tx.lead.findUniqueOrThrow({ where: { id } })
      if (fresh.assignedTo !== Number(user.id)) {
        throw new Error("Anda hanya dapat menghapus lead yang ditugaskan kepada Anda.")
      }
    }
    const activityCount = await tx.leadActivity.count({ where: { leadId: id } })
    if (activityCount > 0) {
      await tx.lead.update({ where: { id }, data: { deletedAt: new Date() } })
    } else {
      await hardDeleteOrSoftDelete(
        () => tx.lead.delete({ where: { id } }),
        () => tx.lead.update({ where: { id }, data: { deletedAt: new Date() } }),
      )
    }
  })
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
      // Putaran 40: SEMUA field penentu dibaca ulang dari baris terkunci —
      // sebelumnya hanya customerId/status/deletedAt, sehingga customer
      // lahir dari kontak snapshot luar tx (updateLead konkuren hilang)
      // dan guard pemilik memakai assignedTo basi (rep lama tetap bisa
      // mengonversi lead yang sudah dipindah).
      const fresh = await tx.lead.findUniqueOrThrow({
        where: { id: leadId },
      })
      if (fresh.customerId) {
        throw new Error("Lead sudah dikonversi menjadi pelanggan.")
      }
      // Recheck penuh sesudah lock: transisi status (mis. ke lost) atau
      // soft-delete yang commit sebelum lock terambil tidak boleh melahirkan
      // customer dari lead non-convertible/terhapus.
      if (fresh.deletedAt) {
        throw new Error("Lead tidak ditemukan")
      }
      if (!isAdmin && fresh.assignedTo !== Number(user.id)) {
        throw new Error("Anda hanya dapat mengonversi lead yang ditugaskan kepada Anda.")
      }
      if (!(CONVERTIBLE_STATUSES as readonly string[]).includes(fresh.status)) {
        throw new Error("Lead belum dapat dikonversi. Status minimal harus 'qualified'.")
      }
      const customerName = fresh.company || fresh.name
      const created = await tx.customer.create({
        data: {
          slug: await nextSlugWithClient(tx as never, "customer", customerName),
          name: customerName,
          contactPerson: fresh.contactName ?? fresh.name,
          email: fresh.email,
          phone: fresh.phone,
          address: fresh.address,
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
    // Putaran 40: kunci baris tiket dalam tx sebelum menilai deletedAt —
    // deleteTicket mengunci baris yang sama, jadi komentar tak bisa lahir
    // di tiket yang sedang di-hard-delete (cascade-musnah) atau sesudah
    // soft-delete (yatim di tombstone).
    const comment = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM crm_tickets WHERE id = ${ticketId} FOR UPDATE`
      const ticket = await tx.crmTicket.findFirst({
        where: { id: ticketId, deletedAt: null },
        select: { id: true },
      })
      if (!ticket) throw new Error("Tiket tidak ditemukan")
      // Putaran 67: retry submit identik melahirkan komentar kembar di
      // timeline + dua entri log aktivitas. Klaim key sesudah kunci baris
      // tiket dan cek hidup; rollback melepaskan key. Tanpa key no-op.
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id)
      return tx.crmTicketComment.create({
        data: {
          ticketId,
          // Penulis dari SESI, bukan dari form: kalau id penulis datang dari form,
          // komentar bisa ditulis atas nama orang lain.
          userId: Number(user.id),
          body: v.body,
          isInternal: v.isInternal,
        },
      })
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

    // Lead harus hidup + pemanggil pemilik/pemegang manage_leads/super_admin
    // (pola guard 484-499) — tanpa ini aktivitas bisa ditulis ke lead
    // terhapus/milik rep lain lalu muncul di antrean follow-up.
    // Putaran 40: kunci baris lead dalam tx sebelum menilai (deleteLead
    // mengunci baris yang sama) — aktivitas tak bisa lahir di lead yang
    // sedang di-hard-delete atau sesudah soft-delete.
    const activity = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM leads WHERE id = ${leadId} FOR UPDATE`
      const lead = await tx.lead.findFirst({
        where: { id: leadId, deletedAt: null },
        select: { id: true, assignedTo: true, status: true },
      })
      if (!lead) throw new Error("Lead tidak ditemukan")
      // lost terminal mutlak (BR-LF-03/Q-LFU-1): aktivitas baru pada lead
      // kalah hanya mencemari histori dan antrean follow-up. won tetap boleh
      // karena antrean follow-up memang mempertahankan lead menang.
      if (lead.status === "lost") {
        throw new Error("Lead sudah kalah (lost) dan tidak dapat menerima aktivitas baru. Buat lead baru untuk peluang lanjutan.")
      }
      const isAdmin =
        user.permissions.includes("manage_leads") || user.roles.includes("super_admin")
      if (!isAdmin && lead.assignedTo !== Number(user.id)) {
        throw new Error("Anda hanya dapat menambahkan aktivitas lead yang ditugaskan kepada Anda.")
      }
      // Putaran 67: retry submit identik melahirkan aktivitas kembar —
      // histori dobel plus dua task terjadwal di antrean follow-up. Klaim
      // key sesudah kunci baris lead dan semua guard; rollback melepaskan
      // key. Tanpa key no-op.
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id)
      return tx.leadActivity.create({
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

    // Gerbang + klaim dalam SATU tx berkunci baris lead (pola addLeadActivity/
    // deleteLead): guard global baca-lalu-klaim membiarkan updateLead->lost,
    // ganti pemilik, atau deleteLead commit di jendelanya lalu klaim tetap
    // menulis completedAt pada lead tombstone/lost dan melapor sukses.
    const outcome = await prisma.$transaction(
      async (tx): Promise<{ success: false; error: string } | null> => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM leads WHERE id = ${leadId} FOR UPDATE`
      }
      const denied = await assertLeadActivityCompletionGuard(user, leadId, activityId, true, tx)
      if (denied) return denied

      const claim = await tx.leadActivity.updateMany({
        where: {
          id: activityId,
          leadId,
          scheduledAt: { not: null },
          completedAt: null,
        },
        data: { completedAt: new Date() },
      })
      if (claim.count === 0) {
        return { success: false, error: await leadActivityStateError(activityId, leadId, true, tx) }
      }
      return null
      },
    )
    if (outcome) return outcome

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

    // Tx berkunci baris lead yang sama seperti completeLeadActivity:
    // gerbang kepemilikan dinilai dari baris terkunci, bukan snapshot.
    const outcome = await prisma.$transaction(
      async (tx): Promise<{ success: false; error: string } | null> => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM leads WHERE id = ${leadId} FOR UPDATE`
      }
      const denied = await assertLeadActivityCompletionGuard(user, leadId, activityId, false, tx)
      if (denied) return denied

      const claim = await tx.leadActivity.updateMany({
        where: {
          id: activityId,
          leadId,
          completedAt: { not: null },
        },
        data: { completedAt: null },
      })
      if (claim.count === 0) {
        return { success: false, error: await leadActivityStateError(activityId, leadId, false, tx) }
      }
      return null
      },
    )
    if (outcome) return outcome

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
  client: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<{ success: false; error: string } | null> {
  const lead = await client.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true, assignedTo: true, status: true },
  })
  if (!lead) return { success: false, error: "Lead tidak ditemukan" }
  // Menyelesaikan aktivitas pada lead lost bertabrakan dengan status
  // terminalnya dan Q-LFU-1 yang mengeluarkannya dari antrean. Reopen tidak
  // digerbang: mengosongkan penanda lama tidak menulis tindak lanjut baru.
  if (completing && lead.status === "lost") {
    return {
      success: false,
      error: "Lead sudah kalah (lost) dan aktivitasnya tidak dapat ditandai selesai. Buat lead baru untuk peluang lanjutan.",
    }
  }

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

  const activity = await client.leadActivity.findFirst({
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
  client: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<string> {
  const activity = await client.leadActivity.findFirst({
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
