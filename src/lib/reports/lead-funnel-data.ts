/**
 * Loader read-only corong prospek (F-2026-10-22-092-S, Q-LF-5 fisik BOT 3).
 *
 * Beban dibatasi tanpa mengorbankan angka (tanpa `take`/cap — cap akan
 * memalsukan total corong): lead ditarik skalar saja, fakta "punya histori
 * tahap" dari agregat `groupBy` LeadActivity, deskripsi kalah hanya untuk
 * lead `lost`, dan aktivitas gerakan penuh hanya bila ada periode (kohort
 * memang butuh histori s.d. akhir periode). Hitungan di builder murni
 * `lead-funnel.ts`. Tanpa migrasi, tanpa mutasi Lead/LeadActivity/Customer.
 *
 * Izin (Q-LF-1, putusan BOT 1): permukaan pemanggil menegakkan
 * requirePermission lebih dulu (pola lead-followups-data) — halaman daftar
 * prospek `view_leads`, halaman laporan `view_reports`. Loader menerima
 * scope EKSPLISIT dari permukaan itu, bukan menebak izin sendiri:
 * - "leads_page": agregat tahap + per sumber, TANPA rincian penanggung
 *   (byAssignee null).
 * - "report": boleh per penanggung bernama (pemegang view_reports /
 *   manage_leads).
 * Scope lain = fail-closed (lempar error). Self-scope assignedTo DITOLAK
 * tahap 1 oleh putusan Q-LF-1 — loader ini tidak menerima saringan
 * penanggung per pemanggil.
 */

import { prisma } from "@/lib/db/prisma"
import { buildLeadFunnel, type LeadFunnel } from "@/lib/reports/lead-funnel"

export type LeadFunnelScope = "leads_page" | "report"

export interface LeadFunnelPeriod {
  start: Date
  end: Date
}

const MOVEMENT_TYPES = ["status_change", "conversion"] as const

export async function getLeadFunnel(
  scope: LeadFunnelScope,
  period: LeadFunnelPeriod | null = null,
): Promise<LeadFunnel> {
  if (scope !== "leads_page" && scope !== "report") {
    throw new Error("Scope corong prospek tidak dikenal; akses ditolak.")
  }
  const includeAssigneeBreakdown = scope === "report"

  const leads = await prisma.lead.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      status: true,
      estimatedValue: true,
      source: true,
      assignedTo: true,
      customerId: true,
      convertedAt: true,
      deletedAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  // Satu agregat massal: lead mana yang punya histori tahap (BR-LF-04).
  const movementGroups = await prisma.leadActivity.groupBy({
    by: ["leadId"],
    where: { type: { in: [...MOVEMENT_TYPES] } },
    _count: { _all: true },
  })
  const stageHistoryIds = new Set(movementGroups.map((g) => g.leadId))

  // Aktivitas penuh hanya untuk: (a) periode — histori gerakan s.d. akhir
  // periode per lead; (b) tanpa periode — cukup aktivitas status_change->lost
  // milik lead lost untuk rincian alasan kalah (Q-LR-3).
  const lostIds = leads.filter((l) => l.status === "lost").map((l) => l.id)
  const activityRows = period
    ? await prisma.leadActivity.findMany({
        where: {
          type: { in: [...MOVEMENT_TYPES] },
          createdAt: { lte: period.end },
        },
        select: {
          leadId: true,
          type: true,
          oldStatus: true,
          newStatus: true,
          createdAt: true,
          description: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : lostIds.length > 0
      ? await prisma.leadActivity.findMany({
          where: { leadId: { in: lostIds }, type: "status_change", newStatus: "lost" },
          select: {
            leadId: true,
            type: true,
            oldStatus: true,
            newStatus: true,
            createdAt: true,
            description: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : []
  const activitiesByLead = new Map<number, typeof activityRows>()
  for (const row of activityRows) {
    const list = activitiesByLead.get(row.leadId) ?? []
    list.push(row)
    activitiesByLead.set(row.leadId, list)
  }

  let assigneeNameById = new Map<number, string>()
  if (includeAssigneeBreakdown) {
    const assigneeIds = Array.from(
      new Set(leads.map((lead) => lead.assignedTo).filter((id) => id != null)),
    )
    if (assigneeIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      })
      assigneeNameById = new Map(users.map((user) => [user.id, user.name]))
    }
  }

  return buildLeadFunnel(
    leads.map((lead) => ({
      id: lead.id,
      status: lead.status,
      estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue),
      source: lead.source,
      assignedTo: lead.assignedTo,
      assignedToName:
        lead.assignedTo != null ? (assigneeNameById.get(lead.assignedTo) ?? null) : null,
      customerId: lead.customerId,
      convertedAt: lead.convertedAt,
      deletedAt: lead.deletedAt,
      activities: (activitiesByLead.get(lead.id) ?? []).map((a) => ({
        type: a.type,
        oldStatus: a.oldStatus,
        newStatus: a.newStatus,
        createdAt: a.createdAt,
        description: a.description,
      })),
      // Tanpa periode, `activities` di atas hanya memuat baris lost —
      // fakta histori tahap datang dari agregat. Dengan periode, array
      // gerakan nyata yang bicara (hasStageHistory dibiarkan undefined).
      hasStageHistory: period ? undefined : stageHistoryIds.has(lead.id),
    })),
    { includeAssigneeBreakdown, period },
  )
}
