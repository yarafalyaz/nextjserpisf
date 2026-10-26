/**
 * Loader read-only antrean tiket CRM terbuka (F-2026-10-25-032-S lapis
 * aman, baca-saja).
 *
 * Izin `view_tickets` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (pola `delivered-unbilled-data.ts`); halaman pemanggil
 * menegakkannya juga sebelum loader. Tanpa key izin baru (BR-CTQ-08).
 *
 * Satu query massal `CrmTicket` populasi BR-CTQ-02 (status non-terminal
 * `open`/`in_progress`, `deletedAt IS NULL`) + satu query massal nama
 * penanggung `User` (pola `lead-assignee-names.ts`, tanpa N+1).
 * Penyaringan ulang populasi, tingkat prioritas, dan urutan BR-CTQ-04
 * ada di builder murni `crm-ticket-queue.ts` supaya kontrak turunan
 * (termasuk rekap beban F-2026-10-25-033-S, BR-CTB-02) tidak bergantung
 * pada query saja. Query membawa status non-terminal + status liar apa
 * adanya: builder yang memutus perlakuan tertanda; terminal tidak
 * pernah terbaca loader ini.
 *
 * Baca-saja mutlak (BR-CTQ-06): nol mutasi CrmTicket/CrmTicketComment,
 * tanpa migrasi, tanpa kolom baru.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveLeadAssigneeNames } from "@/lib/reports/lead-assignee-names"
import {
  buildCrmTicketQueue,
  type CrmTicketQueue,
} from "@/lib/reports/crm-ticket-queue"

export async function getCrmTicketQueue(now: Date = new Date()): Promise<CrmTicketQueue> {
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
      createdAt: true,
      deletedAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const assigneeNameById = await resolveLeadAssigneeNames(
    tickets.map((ticket) => ticket.assignedTo),
  )

  return buildCrmTicketQueue(
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
      createdAt: ticket.createdAt,
      deletedAt: ticket.deletedAt,
    })),
    now,
  )
}
