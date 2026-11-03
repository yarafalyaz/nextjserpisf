import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { groupPermissions, moduleItemsForGroup } from "@/components/layout/module-cards"
import { ReportCatalog, type ReportCatalogCategory } from "@/components/reports/report-catalog"
import { REPORT_CATEGORIES, catalogLabel } from "@/lib/reports/report-catalog"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laporan" }

export default async function ReportsPage() {
  const user = await requireAnyPermission(groupPermissions("/laporan"))

  // Judul, ikon, dan deskripsi tetap satu sumber: navigasi + NAV_CARD_DESCRIPTIONS.
  // Katalog hanya menambahkan pengelompokan kategori dan varian keluarga
  // (REPORT_CATEGORIES), jadi tidak mungkin ada laporan yang tampil dengan nama
  // berbeda dari menunya — labelnya dibentuk dari label menu itu sendiri.
  // Kartu juga disaring izinnya di server: katalog tidak lagi menawarkan
  // laporan payroll kepada pemegang view_reports yang loader-nya menolak,
  // dan pemegang izin laporan khusus tetap bisa membuka hub ini.
  const userPerms = new Set(user.permissions ?? [])
  const isSuperAdmin = user.roles.includes("super_admin")
  const items = new Map(
    moduleItemsForGroup("/laporan")
      .filter((item) => {
        if (isSuperAdmin) return true
        if (item.permissions && item.permissions.length > 0) {
          return item.permissions.some((permission) => userPerms.has(permission))
        }
        return !item.permission || userPerms.has(item.permission)
      })
      .map((item) => [item.href, item]),
  )

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
  }).filter((category) => category.reports.length > 0)

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
