export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AllocationRuleForm } from "./_components/allocation-rule-form"

export const metadata = { title: "Aturan Alokasi Baru" }

export default async function CreateAllocationRulePage() {
  await requirePermission("edit_accounts")

  const [skfs, accounts, costCenters] = await Promise.all([
    prisma.statisticalKeyFigure.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, unit: true } }),
    prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.costCenter.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Anggaran" },
        { label: "Alokasi Key Figure", href: "/anggaran/alokasi-skf" },
        { label: "Baru" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Aturan Alokasi Baru</h1>
      </div>
      <AllocationRuleForm skfs={skfs} accounts={accounts} costCenters={costCenters} />
    </div>
  )
}
