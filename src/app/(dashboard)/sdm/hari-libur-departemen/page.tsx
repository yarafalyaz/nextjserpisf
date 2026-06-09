export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { DepartmentHolidayTable } from "./_components/department-holiday-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Hari Libur Departemen" }

export default async function DepartmentHolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const holidays = await prisma.departmentHoliday.findMany({
    where,
    include: { department: true },
    take: 1000,
    orderBy: { date: "desc" },
  })

  const data = holidays.map((h) => ({
    id: h.id,
    name: h.name,
    departmentName: h.department.name,
    date: h.date.toISOString(),
    isRecurring: h.isRecurring,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Hari Libur Departemen</h1>
        <Link href="/sdm/hari-libur-departemen/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-department-holiday-btn">
          + Tambah Hari Libur Departemen
        </Link>
      </div>

      <DepartmentHolidayTable data={data} />
    </div>
  )
}
