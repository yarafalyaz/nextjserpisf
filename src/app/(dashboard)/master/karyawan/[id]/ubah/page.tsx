export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { EmployeeForm } from "@/components/forms/employee-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Karyawan" }

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requirePermission("edit_employees")

  const data = await prisma.employee.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const employee = {
    id: data.id,
    employeeNo: data.employeeNo,
    name: data.name,
    email: data.email,
    phone: data.phone,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth?.toISOString().split("T")[0] ?? null,
    maritalStatus: data.maritalStatus,
    departmentId: data.departmentId,
    positionId: data.positionId,
    joinDate: data.joinDate.toISOString().split("T")[0],
    paymentFrequency: data.paymentFrequency,
    baseSalary: Number(data.baseSalary),
    province: data.province,
    employeeCity: data.employeeCity,
    employeeDistrict: data.employeeDistrict,
    employeeVillage: data.employeeVillage,
    postalCode: data.postalCode,
  }

  const [departments, positions] = await Promise.all([prisma.department.findMany({ orderBy: { name: "asc" } }), prisma.position.findMany({ orderBy: { name: "asc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master/karyawan" },
  { label: "Karyawan", href: "/master/karyawan" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Karyawan</h1>
      </div>
      <EmployeeForm employee={employee} departments={departments} positions={positions} />
    </div>
  )
}
