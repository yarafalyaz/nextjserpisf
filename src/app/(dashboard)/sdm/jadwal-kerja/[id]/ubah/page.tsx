export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { WorkScheduleForm } from "@/components/forms/work-schedule-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.workSchedule.findUnique({
    where: { id: Number(id) },
    include: { employees: { select: { id: true } }, departments: { select: { id: true } } },
  })

  if (!data) notFound()

  const [departments, employees] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm/jadwal-kerja" },
        { label: "Jadwal Kerja", href: "/sdm/jadwal-kerja" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Jadwal Kerja</h1>
      </div>
      <WorkScheduleForm schedule={{
        id: data.id,
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        workDays: data.workDays,
        departmentIds: data.departments.map((d) => d.id),
        lateToleranceMinutes: data.lateToleranceMinutes ?? undefined,
        isActive: data.isActive ?? undefined,
        employeeIds: data.employees.map((e) => e.id),
      }} departments={departments} employees={employees} />
    </div>
  )
}
