export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import Link from "next/link"
import { getAllocationRules } from "@/actions/allocation.actions"
import { AllocationRuleList } from "./_components/allocation-rule-list"

export const metadata = { title: "Alokasi Key Figure" }

export default async function AllocationRulesPage() {
  await requirePermission("view_statistical_key_figures")

  const [result, skfs, accounts, costCenters] = await Promise.all([
    getAllocationRules(),
    prisma.statisticalKeyFigure.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } }),
    prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.costCenter.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Anggaran" },
        { label: "Alokasi Key Figure" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Alokasi Key Figure</h1>
        <Link href="/anggaran/alokasi-skf/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          + Aturan Baru
        </Link>
      </div>
      <AllocationRuleList data={result.data} skfs={skfs} accounts={accounts} costCenters={costCenters} />
    </div>
  )
}
