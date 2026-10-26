/**
 * Loader read-only SLA tiket CRM (F-2026-10-24-135-S lapis aman,
 * baca-saja).
 *
 * Izin `view_tickets` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (pola `crm-ticket-queue-data.ts`); halaman pemanggil menegakkannya
 * juga sebelum loader. Tanpa key izin baru.
 *
 * Satu query massal `CrmTicket` aktif (`open`/`in_progress`,
 * `deletedAt IS NULL`) + satu query `Holiday` (tanggal >= tanggal WIB
 * tiket aktif tertua; tanpa tiket aktif query libur dilewati) + satu
 * query massal nama penanggung `User` (pola `lead-assignee-names.ts`,
 * tanpa N+1). Keadaan, tenggat, dan urutan antrean diputus builder
 * murni `crm-ticket-sla.ts` — loader tidak menurunkan keadaan sendiri.
 *
 * Baca-saja mutlak: nol mutasi CrmTicket, tanpa kolom SLA baru.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveLeadAssigneeNames } from "@/lib/reports/lead-assignee-names"
import {
  buildCrmTicketSla,
  type CrmTicketSlaResult,
} from "@/lib/reports/crm-ticket-sla"

export async function getCrmTicketSla(now: Date = new Date()): Promise<CrmTicketSlaResult> {
  await requirePermission("view_tickets")

  const tickets = await prisma.crmTicket.findMany({
    where: {
      deletedAt: null,
      status: { in: ["open", "in_progress"] },
    },
    select: {
      id: true,
      slug: true,
      ticketNumber: true,
      subject: true,
      priority: true,
      status: true,
      customerName: true,
      assignedTo: true,
      firstResponseAt: true,
      resolvedAt: true,
      createdAt: true,
      deletedAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  // Batas bawah diperlebar 2 hari dari tiket tertua: Holiday tersimpan
  // sebagai instant — saringan instant kasar tidak boleh membuang libur
  // yang tanggal WIB-nya sama dengan tanggal tiket tertua. Builder
  // memutus per tanggal WIB, kelebihan baris libur lama tidak berpengaruh.
  const holidays =
    tickets.length > 0
      ? await prisma.holiday.findMany({
          where: { date: { gte: new Date(tickets[0].createdAt.getTime() - 2 * 86_400_000) } },
          select: { date: true },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        })
      : []

  const assigneeNameById = await resolveLeadAssigneeNames(
    tickets.map((ticket) => ticket.assignedTo),
  )

  return buildCrmTicketSla(
    tickets.map((ticket) => ({
      id: ticket.id,
      slug: ticket.slug,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      priority: ticket.priority,
      status: ticket.status,
      customerName: ticket.customerName,
      assignedTo: ticket.assignedTo,
      assignedToName:
        ticket.assignedTo != null ? (assigneeNameById.get(ticket.assignedTo) ?? null) : null,
      firstResponseAt: ticket.firstResponseAt,
      resolvedAt: ticket.resolvedAt,
      createdAt: ticket.createdAt,
      deletedAt: ticket.deletedAt,
    })),
    now,
    holidays.map((holiday) => holiday.date),
  )
}
