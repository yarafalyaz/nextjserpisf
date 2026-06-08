export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { DepartmentTable } from "./_components/department-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  const params = await searchParams

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
    select: { id: true, code: true, name: true, description: true },
  })

  const tableData = JSON.parse(JSON.stringify(departments))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data" }, { label: "Departemen" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Departemen</h1>
<Link href="/master/departemen/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-department-btn">
          + Tambah Departemen
        </Link>
      </div>

      <DepartmentTable data={tableData} />
    </div>
  )
}
