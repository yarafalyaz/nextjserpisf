export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { EmployeeTable } from "./_components/employee-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Karyawan" }

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_employees")

  const params = await searchParams

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
    take: 1000,
  })

  const tableData = toPlain(employees) as any


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Karyawan" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Karyawan</h1>
<Link href="/master/karyawan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-employee-btn">
          + Tambah Karyawan
        </Link>
      </div>

      <EmployeeTable data={tableData} />
    </div>
  )
}
