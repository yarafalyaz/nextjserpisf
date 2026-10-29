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
  STALE_LEAD_THRESHOLD_DAYS,
  buildStaleLeads,
  type StaleLeads,
} from "@/lib/reports/stale-leads"

export async function getStaleLeads(now: Date = new Date()): Promise<StaleLeads> {
  // Pra-saring DB ekuivalen ambang builder (idleDays > 7 kalender): lead
  // dibuat sebelum cutoff DAN tanpa aktivitas yang tanggal efektifnya
  // (completedAt ?? scheduledAt ?? createdAt) >= cutoff. OR per aktivitas
  // adalah SUPERSET aman (aktivitas campuran lama/baru bisa lolos) —
  // buildStaleLeads tetap otoritas final, jadi angka persis, tanpa `take`
  // (cap akan menyembunyikan lead basi secara diam-diam).
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - STALE_LEAD_THRESHOLD_DAYS)
  cutoff.setHours(0, 0, 0, 0)
  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      status: { in: [...STALE_LEAD_STATUSES] },
      createdAt: { lt: cutoff },
      activities: {
        none: {
          OR: [
            { completedAt: { gte: cutoff } },
            { completedAt: null, scheduledAt: { gte: cutoff } },
            { completedAt: null, scheduledAt: null, createdAt: { gte: cutoff } },
          ],
        },
      },
    },
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
