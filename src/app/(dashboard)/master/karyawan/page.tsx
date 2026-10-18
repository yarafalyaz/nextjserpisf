import { parsePagination } from "@/lib/utils/pagination"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { EmployeeTable } from "./_components/employee-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Karyawan" }

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_employees")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { employeeNo: { contains: params.cari } },
        { phone: { contains: params.cari } },
      ],
    }),
  }

  const employees = await prisma.employee.findMany({
    where,
    include: {
      department: true,
      position: true,
      user: {
        include: {
          roles: true,
        },
      },
    },
    orderBy: { name: "asc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.employee.count({ where })

  const tableData = toPlain(employees)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Karyawan" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Karyawan</h1>
<CanCreate permission="create_employees">
          <Link href="/master/karyawan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-employee-btn">
          + Tambah Karyawan
        </Link>
        </CanCreate>
      </div>

      <EmployeeTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
