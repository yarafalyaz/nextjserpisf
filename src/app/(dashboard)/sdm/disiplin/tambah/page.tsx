export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DisciplinaryRequestForm } from "@/components/reports/disciplinary-request-form"
import { DISCIPLINARY_TITLE } from "@/components/reports/disciplinary-attention-card"
import {
  DISCIPLINARY_LEVEL_LABELS,
  DISCIPLINARY_VIOLATION_CATEGORIES,
} from "@/lib/reports/disciplinary"

export const metadata: Metadata = { title: "Pengajuan Surat Peringatan Baru" }

/** Jenjang yang boleh diajukan (teguran lisan bukan pilihan pengaju, §1.2). */
const REQUEST_LEVELS = (["sp1", "sp2", "sp3", "sp_first_final"] as const).map((level) => ({
  value: level,
  label: DISCIPLINARY_LEVEL_LABELS[level],
}))

export default async function CreateDisciplinaryPage() {
  const user = await requirePermission("create_disciplinary_records")
  const scope = await getHrScope(user)

  const employees = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null, ...hrEmployeeScopeWhere(scope) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: DISCIPLINARY_TITLE, href: "/sdm/disiplin" },
          { label: "Pengajuan Baru" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pengajuan Surat Peringatan Baru</h1>
      <DisciplinaryRequestForm
        employees={employees}
        levels={REQUEST_LEVELS}
        categories={DISCIPLINARY_VIOLATION_CATEGORIES}
      />
    </div>
  )
}
