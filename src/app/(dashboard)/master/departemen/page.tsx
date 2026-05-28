export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { DepartmentTable } from "./_components/department-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    }),
  }

  const departments = await prisma.department.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true, description: true },
  })

  const tableData = JSON.parse(JSON.stringify(departments))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data" }, { label: "Departemen" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Departemen</h1>
<Link href="/master/departemen/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-department-btn">
          + Tambah Departemen
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama atau kode..." action="/master/departemen" />
        </div>

        <DepartmentTable data={tableData} />
      </div>
    </div>
  )
}
