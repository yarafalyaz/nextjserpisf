/**
 * Loader read-only daftar lead basi (F-2026-10-20-29(a)).
 *
 * Satu query massal lead new/contacted yang belum terhapus lengkap dengan
 * seluruh aktivitasnya — bukan per-lead (tanpa N+1). Penyaringan basi,
 * hitungan hari diam, dan urutan ada di builder murni `stale-leads.ts`.
 *
 * Read-only: tanpa migrasi, tanpa jurnal, tanpa mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import {
  STALE_LEAD_STATUSES,
  buildStaleLeads,
  type StaleLeads,
} from "@/lib/reports/stale-leads"

export async function getStaleLeads(now: Date = new Date()): Promise<StaleLeads> {
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null, status: { in: [...STALE_LEAD_STATUSES] } },
    select: {
      id: true,
      slug: true,
      leadNumber: true,
      name: true,
      company: true,
      status: true,
      createdAt: true,
      activities: {
        select: { completedAt: true, scheduledAt: true, createdAt: true },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  })

  return buildStaleLeads(leads, now)
}
