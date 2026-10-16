import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"

export const metadata: Metadata = { title: "Detail Kategori Pengeluaran" }

export default async function ExpenseCategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("manage_expense_categories")

  const { slug } = await params

  const category = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.expenseCategory.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.expenseCategory.findUnique({ where: { id } }),
    },
  )
  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Detail Kategori`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Kategori Pengeluaran", href: "/master/kategori-pengeluaran" },
          { label: category.label },
        ]}
        actions={
          <>
            <Button href={entityEditHref("/master/kategori-pengeluaran", category)} variant="primary">Ubah</Button>
            <BackButton href="/master/kategori-pengeluaran" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama" value={category.name} mono />
        <DetailField label="Label" value={category.label} />
        <DetailField label="Urutan" value={category.sortOrder} />
        <DetailField
          label="Status"
          value={
            category.isActive ? (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Aktif</span>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">Nonaktif</span>
            )
          }
        />
      </DetailCard>
    </div>
  )
}
