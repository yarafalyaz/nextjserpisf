export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SkfMatrixForm } from "./_components/skf-matrix-form"

export const metadata = { title: "Input Nilai Key Figure" }

export default async function InputSkfValuesPage() {
  await requirePermission("view_statistical_key_figures")

  const [skfs, costCenters] = await Promise.all([
    prisma.statisticalKeyFigure.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, unit: true },
    }),
    prisma.costCenter.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ])

  const periods: string[] = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Angka Kunci Statistik", href: "/keuangan/angka-kunci-statistik" },
        { label: "Nilai", href: "/keuangan/angka-kunci-statistik/nilai" },
        { label: "Input" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Input Nilai Key Figure per Pusat Biaya</h1>
      </div>
      <SkfMatrixForm skfs={skfs} costCenters={costCenters} periods={periods} />
    </div>
  )
}
