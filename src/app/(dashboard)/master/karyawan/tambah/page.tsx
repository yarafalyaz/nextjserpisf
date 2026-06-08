export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { EmployeeForm } from "@/components/forms/employee-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"

export default async function CreateEmployeePage() {
  await requirePermission("create_employees")

  const [departments, positions, generatedCode] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.position.findMany({ orderBy: { name: "asc" } }),
    peekNextDocumentNumber("EMP", "simple"),
  ])
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoEmployeeCode !== false

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Karyawan", href: "/master/karyawan" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Karyawan</h1>
      </div>
      <EmployeeForm departments={departments} positions={positions} generatedCode={generatedCode} enableAutoCode={enableAutoCode} />
    </div>
  )
}
