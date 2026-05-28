export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { EmployeeTable } from "./_components/employee-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  await requirePermission("view_employees")

  const params = await searchParams

  const where = {
    deletedAt: null,
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { employeeNo: { contains: params.search } },
        { phone: { contains: params.search } },
      ],
    }),
  }

  const employees = await prisma.employee.findMany({
    where,
    include: { department: true, position: true },
    orderBy: { name: "asc" },
  })

  const tableData = JSON.parse(JSON.stringify(employees))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Karyawan" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Employees</h1>
<Link href="/master/karyawan/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-employee-btn">
          + Tambah Karyawan
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama, NIP, atau telepon..." action="/master/karyawan" />
        </div>

        <EmployeeTable data={tableData} />
      </div>
    </div>
  )
}
