export const dynamic = "force-dynamic"

import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CategoryTable } from "./_components/category-table"

import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"

export const metadata: Metadata = { title: "Kategori Pengeluaran" }

export default async function ExpenseCategoryPage() {
  await requirePermission("manage_expense_categories")

  const categories = await prisma.expenseCategory.findMany({
    orderBy: { sortOrder: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Kategori Pengeluaran" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kategori Pengeluaran</h1>
        <Link
          href="/master/kategori-pengeluaran/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Tambah Kategori
        </Link>
      </div>

      <CategoryTable data={categories} />
    </div>
  )
}
