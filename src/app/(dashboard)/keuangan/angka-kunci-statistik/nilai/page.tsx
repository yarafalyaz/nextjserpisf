export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import Link from "next/link"
import { SkfValueTable } from "./_components/skf-value-table"

export const metadata = { title: "Nilai Key Figure" }

export default async function SkfValuesPage() {
  await requirePermission("view_statistical_key_figures")

  const [skfs, values, costCenters] = await Promise.all([
    prisma.statisticalKeyFigure.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, unit: true },
    }),
    prisma.skfValue.findMany({
      include: {
        statisticalKeyFigure: { select: { id: true, name: true, code: true, unit: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ period: "desc" }, { costCenterId: "asc" }],
    }),
    prisma.costCenter.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Angka Kunci Statistik", href: "/keuangan/angka-kunci-statistik" },
        { label: "Nilai" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Nilai Key Figure per Periode</h1>
        <Link href="/keuangan/angka-kunci-statistik/nilai/isikan"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          + Input Nilai
        </Link>
      </div>
      <SkfValueTable
        values={values.map((v) => ({ ...v, value: Number(v.value) }))}
        skfs={skfs}
        costCenters={costCenters}
      />
    </div>
  )
}
