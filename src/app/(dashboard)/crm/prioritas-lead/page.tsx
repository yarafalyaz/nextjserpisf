export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { LeadPriorityQueueCard } from "@/components/reports/lead-priority-queue-card"
import { getLeadPriorityQueue } from "@/lib/reports/lead-priority-data"

export const metadata: Metadata = { title: "Prioritas Lead" }

/**
 * Daftar kerja prioritas lead (F-2026-10-25-031-S tahap 1 lapis aman).
 * Fail-closed `view_leads` sebelum loader dipanggil (koreksi QA atas
 * kontrak Backend); ember/label/urutan/total dari builder apa adanya —
 * halaman tidak menghitung ulang. Baca-saja total.
 */
export default async function LeadPriorityPage() {
  await requirePermission("view_leads")

  const queue = await getLeadPriorityQueue()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "CRM", href: "/crm" },
          { label: "Prioritas Lead" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        Prioritas Lead
      </h1>
      <LeadPriorityQueueCard queue={queue} />
    </div>
  )
}
