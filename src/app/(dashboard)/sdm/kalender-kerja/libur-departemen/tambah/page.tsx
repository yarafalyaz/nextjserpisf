export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { DepartmentHolidayForm } from "../../_components/work-calendar-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Hari Libur Departemen" }

export default async function CreateDepartmentHolidayPage() {
  await requirePermission("create_holidays")
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tambah Hari Libur Departemen"
        subtitle="Hanya berlaku untuk departemen yang dipilih."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Kalender Kerja", href: "/sdm/kalender-kerja" },
          { label: "Tambah Hari Libur Departemen" },
        ]}
      />
      <FormCard>
        <DepartmentHolidayForm departments={departments} />
      </FormCard>
    </div>
  )
}
