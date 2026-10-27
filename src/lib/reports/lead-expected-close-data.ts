/**
 * Loader read-only antrean prospek mendekati/lampaui target tutup
 * (F-2026-10-25-027-S, putusan Lead 2026-10-25 15:20 WIB).
 *
 * Satu query massal Lead `deletedAt IS NULL` + satu query massal nama
 * penanggung (pola `lead-funnel-data.ts`, tanpa N+1). Penyaringan
 * terminal, ember tanggal, urutan urgensi, dan Σ per ember ada di
 * builder murni `lead-expected-close.ts`. Baca-saja: nol mutasi
 * Lead/LeadActivity (BR-EC-07), tanpa migrasi.
 *
 * Izin (Q-EC-2 Lead): permukaan pemanggil menegakkan
 * `requirePermission("view_reports")` lebih dulu (halaman corong
 * existing); loader tidak menebak izin sendiri. Tautan detail lead di
 * UI mensyaratkan `view_leads` pemakai — baris tetap tampil, tautan
 * nonaktif tertanda bila tanpa izin itu; loader tidak menyaring baris
 * berdasar `view_leads`.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildLeadExpectedCloseQueue,
  LEAD_EXPECTED_CLOSE_WINDOW_DAYS,
  type LeadExpectedCloseQueue,
} from "@/lib/reports/lead-expected-close"

export async function getLeadExpectedCloseQueue(
  now: Date = new Date(),
  windowDays: number = LEAD_EXPECTED_CLOSE_WINDOW_DAYS,
): Promise<LeadExpectedCloseQueue> {
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      leadNumber: true,
      name: true,
      status: true,
      expectedCloseDate: true,
      estimatedValue: true,
      assignedTo: true,
      deletedAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const assigneeIds = Array.from(
    new Set(leads.map((lead) => lead.assignedTo).filter((id) => id != null)),
  )
  let assigneeNameById = new Map<number, string>()
  if (assigneeIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true },
    })
    assigneeNameById = new Map(users.map((user) => [user.id, user.name]))
  }

  return buildLeadExpectedCloseQueue(
    leads.map((lead) => ({
      id: lead.id,
      slug: lead.slug,
      leadNumber: lead.leadNumber,
      name: lead.name,
      status: lead.status,
      expectedCloseDate: lead.expectedCloseDate,
      estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue),
      assignedTo: lead.assignedTo,
      assignedToName:
        lead.assignedTo != null ? (assigneeNameById.get(lead.assignedTo) ?? null) : null,
      deletedAt: lead.deletedAt,
    })),
    now,
    windowDays,
  )
}
