/**
 * Loader read-only corong prospek (F-2026-10-22-092-S, Q-LF-5 fisik BOT 3).
 *
 * Satu query massal Lead non-deleted + seluruh aktivitas status_change/
 * conversion-nya (relasi Prisma, tanpa N+1), plus satu query massal nama
 * penanggung HANYA bila scope mengizinkan. Hitungan di builder murni
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
      activities: {
        where: { type: { in: ["status_change", "conversion"] } },
        select: { type: true, oldStatus: true, newStatus: true, createdAt: true, description: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

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
      activities: lead.activities,
    })),
    { includeAssigneeBreakdown, period },
  )
}
