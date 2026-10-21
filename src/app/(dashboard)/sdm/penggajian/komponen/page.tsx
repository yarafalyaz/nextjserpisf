export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getPayrollComponents } from "@/actions/hrm.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { PayrollComponentMaster } from "@/components/payroll/payroll-component-master"

export const metadata: Metadata = { title: "Komponen Gaji" }

export default async function PayrollComponentsPage() {
  await requirePermission("view_payroll")
  const [result, accounts] = await Promise.all([
    getPayrollComponents(),
    prisma.account.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
      take: 500,
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Komponen Gaji"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Penggajian", href: "/sdm/penggajian" },
          { label: "Komponen Gaji" },
        ]}
        actions={<BackButton href="/sdm/penggajian" />}
      />
      {result.success ? (
        <PayrollComponentMaster components={result.data ?? []} accounts={accounts} />
      ) : (
        <div className="rounded-xl border border-danger/20 bg-danger/10 p-6 text-danger" role="alert">
          {result.error || "Komponen gaji tidak dapat dimuat."}
        </div>
      )}
    </div>
  )
}
