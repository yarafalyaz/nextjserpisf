/**
 * Loader read-only antrean follow-up lead terjadwal (F-2026-10-21-037;
 * F-2026-10-25-047-S Q-LFU-1 terputus Lead 2026-10-26 00:40 WIB).
 *
 * Satu query massal lead yang belum terhapus lengkap dengan seluruh
 * aktivitasnya — bukan per-lead (tanpa N+1). Penyaringan jatuh-tempo,
 * pilihan jadwal terawal, hitungan hari terlambat, urutan, dan saring
 * status `lost` (Q-LFU-1) ada di builder murni `lead-followups.ts`;
 * loader membawa `convertedAt` apa adanya (bukan penyaring).
 *
 * Read-only: tanpa migrasi, tanpa jurnal, tanpa mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import { buildLeadFollowups, type LeadFollowups } from "@/lib/reports/lead-followups"

export async function getLeadFollowups(now: Date = new Date()): Promise<LeadFollowups> {
  // Pra-saring DB: `lost` terputus antrean (Q-LFU-1, builder tetap menyaring)
  // dan hanya aktivitas terjadwal belum selesai yang sudah jatuh tempo s.d.
  // akhir hari ini yang relevan. Tanpa `take` — cap akan menyembunyikan
  // follow-up lewat secara diam-diam; builder tetap otoritas final angka.
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null, status: { not: "lost" } },
    select: {
      id: true,
      slug: true,
      leadNumber: true,
      name: true,
      status: true,
      convertedAt: true,
      activities: {
        where: {
          scheduledAt: { not: null, lte: endOfToday },
          completedAt: null,
        },
        select: { scheduledAt: true, completedAt: true, createdAt: true },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  })

  return buildLeadFollowups(leads, now)
}
