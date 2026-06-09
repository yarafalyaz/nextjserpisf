export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { DepartmentHolidayForm } from "../../_components/department-holiday-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Hari Libur Departemen" }

export default async function EditDepartmentHolidayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const holiday = await prisma.departmentHoliday.findUnique({
    where: { id: Number(id) },
  })

  if (!holiday) notFound()

  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Hari Libur Departemen</h1>
      </div>
      <DepartmentHolidayForm
        holiday={{
          id: holiday.id,
          departmentId: holiday.departmentId,
          name: holiday.name,
          date: holiday.date.toISOString().split("T")[0],
          isRecurring: holiday.isRecurring,
        }}
        departments={departments}
      />
    </div>
  )
}
