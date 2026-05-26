export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { DepartmentHolidayForm } from "../_components/department-holiday-form"

export default async function CreateDepartmentHolidayPage() {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Hari Libur Departemen</h1>
      </div>
      <DepartmentHolidayForm departments={departments} />
    </div>
  )
}
