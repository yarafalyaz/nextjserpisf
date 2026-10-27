export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { EmployeeForm } from "@/components/forms/employee-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Karyawan" }

export default async function CreateEmployeePage() {
  await requirePermission("create_employees")

  const [departments, positions, generatedCode, roles, managers] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.position.findMany({ orderBy: { name: "asc" } }),
    peekNextDocumentNumber("EMP", "simple"),
    prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.employee.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoEmployeeCode !== false

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Karyawan", href: "/master/karyawan" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Karyawan</h1>
      </div>
      <EmployeeForm departments={departments} positions={positions} managers={managers} generatedCode={generatedCode} enableAutoCode={enableAutoCode} roles={roles} />
    </div>
  )
}
