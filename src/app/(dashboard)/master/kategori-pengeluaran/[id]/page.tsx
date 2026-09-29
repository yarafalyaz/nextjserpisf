import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"

export const metadata: Metadata = { title: "Detail Kategori Pengeluaran" }

export default async function ExpenseCategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("manage_expense_categories")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const category = await prisma.expenseCategory.findUnique({
    where: { id: numId },
  })
  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Detail Kategori`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Kategori Pengeluaran", href: "/master/kategori-pengeluaran" },
          { label: category.label },
        ]}
        actions={
          <>
            <Button href={`/master/kategori-pengeluaran/${id}/ubah`} variant="primary">Ubah</Button>
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
