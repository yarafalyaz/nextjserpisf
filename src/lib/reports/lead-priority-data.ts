/**
 * Loader read-only daftar kerja prioritas lead (F-2026-10-25-031-S
 * tahap 1 lapis aman).
 *
 * Satu query massal Lead `deletedAt IS NULL` + satu query massal nama
 * penanggung (pola `lead-expected-close-data.ts`, tanpa N+1).
 * Penyaringan populasi, ember "Belum ditetapkan", dan urutan
 * BR-LSC-08 ada di builder murni `lead-priority.ts`. Baca-saja: nol
 * mutasi Lead/LeadActivity, tanpa migrasi, tanpa kolom prioritas.
 *
 * Izin: permukaan pemanggil menegakkan izin baca lead existing
 * (`view_leads`) lebih dulu; loader tidak menebak izin sendiri dan
 * tidak membuat key baru (BR-LSC-12, Q-LSC-4 menunggu putusan Lead).
 */

import { prisma } from "@/lib/db/prisma"
import { resolveLeadAssigneeNames } from "@/lib/reports/lead-assignee-names"
import {
  buildLeadPriorityQueue,
  type LeadPriorityQueue,
} from "@/lib/reports/lead-priority"

export async function getLeadPriorityQueue(): Promise<LeadPriorityQueue> {
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      leadNumber: true,
      name: true,
      status: true,
      source: true,
      expectedCloseDate: true,
      estimatedValue: true,
      assignedTo: true,
      convertedAt: true,
      deletedAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const assigneeNameById = await resolveLeadAssigneeNames(
    leads.map((lead) => lead.assignedTo),
  )

  return buildLeadPriorityQueue(
    leads.map((lead) => ({
      id: lead.id,
      slug: lead.slug,
      leadNumber: lead.leadNumber,
      name: lead.name,
      status: lead.status,
      source: lead.source,
      expectedCloseDate: lead.expectedCloseDate,
      estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue),
      assignedTo: lead.assignedTo,
      assignedToName:
        lead.assignedTo != null ? (assigneeNameById.get(lead.assignedTo) ?? null) : null,
      convertedAt: lead.convertedAt,
      deletedAt: lead.deletedAt,
    })),
  )
}
