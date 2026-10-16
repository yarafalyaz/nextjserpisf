import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { moduleItemsForGroup } from "@/components/layout/module-cards"
import { ReportCatalog, type ReportCatalogCategory } from "@/components/reports/report-catalog"
import { REPORT_CATEGORIES, catalogLabel } from "@/lib/reports/report-catalog"
import { requirePermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laporan" }

export default async function ReportsPage() {
  await requirePermission("view_reports")

  // Judul, ikon, dan deskripsi tetap satu sumber: navigasi + NAV_CARD_DESCRIPTIONS.
  // Katalog hanya menambahkan pengelompokan kategori dan varian keluarga
  // (REPORT_CATEGORIES), jadi tidak mungkin ada laporan yang tampil dengan nama
  // berbeda dari menunya — labelnya dibentuk dari label menu itu sendiri.
  const items = new Map(moduleItemsForGroup("/laporan").map((item) => [item.href, item]))

  const categories: ReportCatalogCategory[] = REPORT_CATEGORIES.map((category) => {
    const CategoryIcon = category.icon
    return {
      key: category.key,
      label: category.label,
      icon: <CategoryIcon size={18} aria-hidden="true" />,
      reports: category.reports.flatMap((entry) => {
        const item = items.get(entry.href)
        if (!item) return []
        const ItemIcon = item.icon
        return [
          {
            href: entry.href,
            label: catalogLabel(entry, item.label),
            desc: item.desc,
            icon: <ItemIcon size={18} aria-hidden="true" />,
          },
        ]
      }),
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan" }]} />
      <h1 id="laporan-heading" className="text-2xl font-bold text-foreground">
        Laporan
      </h1>
      <ReportCatalog categories={categories} />
    </div>
  )
}
