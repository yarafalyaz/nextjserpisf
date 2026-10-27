export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DisciplinaryDeductionDecisionForm } from "@/components/reports/disciplinary-deduction-decision-form"
import { DISCIPLINARY_TITLE } from "@/components/reports/disciplinary-attention-card"

export const metadata: Metadata = { title: "Catat Keputusan Potongan Disiplin" }

/**
 * BR-DISC-09: halaman pencatatan dokumen keputusan potongan disiplin.
 * Opsi karyawan/SP/akun dimuat server dalam scope HR pemanggil
 * (fail-closed); guard bisnis ditegakkan Server Action + service,
 * error tampil verbatim di form.
 */
export default async function CreateDisciplinaryDeductionDecisionPage() {
  const user = await requirePermission("create_disciplinary_records")
  const scope = await getHrScope(user)
  const employeeWhere = { isActive: true, deletedAt: null, ...hrEmployeeScopeWhere(scope) }

  const [employees, records, accounts] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employeeDisciplinaryRecord.findMany({
      where: { deletedAt: null, employee: employeeWhere },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        employeeId: true,
        documentNo: true,
        level: true,
        employee: { select: { name: true } },
      },
    }),
    prisma.account.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: DISCIPLINARY_TITLE, href: "/sdm/disiplin" },
          { label: "Catat Keputusan" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        Catat Keputusan Potongan Disiplin
      </h1>
      <DisciplinaryDeductionDecisionForm
        employees={employees}
        records={records.map((r) => ({
          id: r.id,
          employeeId: r.employeeId,
          documentNo: r.documentNo,
          label: `${r.documentNo ?? "SP tanpa nomor"} — ${r.employee.name} (${r.level})`,
        }))}
        accounts={accounts}
      />
    </div>
  )
}
