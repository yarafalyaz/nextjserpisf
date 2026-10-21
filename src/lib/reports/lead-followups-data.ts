/**
 * Loader read-only antrean follow-up lead terjadwal (F-2026-10-21-037).
 *
 * Satu query massal lead belum terhapus lengkap dengan aktivitasnya —
 * bukan per-lead (tanpa N+1), pola sama dengan stale-leads-data.
 * Penyaringan jadwal terawal terbuka, hitungan hari lewat, dan urutan
 * ada di builder murni `lead-followups.ts`.
 *
 * Read-only: tanpa migrasi, tanpa jurnal, tanpa mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import { buildLeadFollowUps, type LeadFollowUps } from "@/lib/reports/lead-followups"

export async function getLeadFollowUps(now: Date = new Date()): Promise<LeadFollowUps> {
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      leadNumber: true,
      name: true,
      company: true,
      status: true,
      activities: {
        select: { id: true, type: true, subject: true, scheduledAt: true, completedAt: true },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  })

  return buildLeadFollowUps(leads, now)
}
