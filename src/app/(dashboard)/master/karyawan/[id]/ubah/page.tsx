export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EmployeeForm } from "@/components/forms/employee-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.employee.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const [departments, positions] = await Promise.all([prisma.department.findMany({ orderBy: { name: "asc" } }), prisma.position.findMany({ orderBy: { name: "asc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master/karyawan" },
  { label: "Karyawan", href: "/master/karyawan" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Karyawan</h1>
      </div>
      <EmployeeForm employee={data as any} departments={departments as any} positions={positions as any} />
    </div>
  )
}
