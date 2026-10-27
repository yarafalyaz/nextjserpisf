export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  DisciplinaryAttentionCard,
  DISCIPLINARY_TITLE,
} from "@/components/reports/disciplinary-attention-card"
import { DisciplinaryRecordsTable } from "@/components/reports/disciplinary-records-table"
import { loadDisciplinaryAttention, loadDisciplinaryRecords } from "@/lib/reports/disciplinary-data"
import { loadDisciplinaryQueue } from "@/lib/reports/disciplinary-queue-data"
import { DisciplinaryQueueCard } from "@/components/reports/disciplinary-queue-card"
import { loadDisciplinaryDeductionDecisions } from "@/lib/reports/disciplinary-deduction-data"
import { DisciplinaryDeductionDecisionsCard } from "@/components/reports/disciplinary-deduction-decisions-card"

export const metadata: Metadata = { title: DISCIPLINARY_TITLE }

/**
 * DISC-F1: permukaan disiplin karyawan. Daftar perhatian + seluruh rekod
 * dalam scope HR pemanggil dari loader server (fail-closed); UI menampilkan
 * turunan server apa adanya dan tidak menghitung jenjang/masa berlaku.
 * Tanpa field gaji (BR-DISC-08).
 */
export default async function DisciplinaryPage() {
  const user = await requirePermission("view_disciplinary_records")
  const scope = await getHrScope(user)
  const canViewAmount = await hasPermission("view_payroll")
  const [attention, records, decisions, queue] = await Promise.all([
    loadDisciplinaryAttention(scope),
    loadDisciplinaryRecords(scope),
    loadDisciplinaryDeductionDecisions(scope, canViewAmount),
    loadDisciplinaryQueue(),
  ])
  const canCreate = await hasPermission("create_disciplinary_records")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: DISCIPLINARY_TITLE },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{DISCIPLINARY_TITLE}</h1>
        {canCreate ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href="/sdm/disiplin/tambah"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover"
            >
              Pengajuan Baru
            </Link>
            <Link
              href="/sdm/disiplin/keputusan"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-default px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted"
            >
              Catat Keputusan Potongan
            </Link>
          </div>
        ) : null}
      </div>
      <DisciplinaryAttentionCard attention={attention} />
      <DisciplinaryQueueCard queue={queue} />
      <DisciplinaryRecordsTable records={records} />
      <DisciplinaryDeductionDecisionsCard decisions={decisions} />
    </div>
  )
}
