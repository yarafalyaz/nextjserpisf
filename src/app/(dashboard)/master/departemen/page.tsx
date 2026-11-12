import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { DepartmentTable } from "./_components/department-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Departemen" }

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_departments")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
      ],
    }),
  }

  const departments = await prisma.department.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, code: true, name: true, description: true },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.department.count({ where })

  const tableData = toPlain(departments)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Departemen" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Departemen & Divisi
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Struktur organisasi perusahaan, pemetaan unit kerja, dan alokasi pusat biaya staf.
          </p>
        </div>
        <CanCreate permission="create_departments">
          <Link
            href="/master/departemen/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-department-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Departemen</span>
          </Link>
        </CanCreate>
      </div>

      <DepartmentTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
