export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "@/components/ui/fontawesome-icons"

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {DISCIPLINARY_TITLE}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pencatatan pelanggaran tata tertib kerja, surat peringatan (SP), masa berlaku sanksi, dan keputusan potongan denda.
          </p>
        </div>
        {canCreate ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/sdm/disiplin/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Pengajuan Baru</span>
            </Link>
            <Link
              href="/sdm/disiplin/keputusan"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
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
