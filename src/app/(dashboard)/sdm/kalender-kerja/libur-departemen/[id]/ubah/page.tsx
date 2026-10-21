export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { DepartmentHolidayForm } from "../../../_components/work-calendar-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Hari Libur Departemen" }

export default async function EditDepartmentHolidayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_holidays")
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const [departments, item] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.departmentHoliday.findUnique({ where: { id } }),
  ])
  if (!item) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ubah Hari Libur Departemen"
        subtitle={item.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Kalender Kerja", href: "/sdm/kalender-kerja" },
          { label: "Ubah Hari Libur Departemen" },
        ]}
      />
      <FormCard>
        <DepartmentHolidayForm
          key={item.id}
          departments={departments}
          item={{
            id: item.id,
            name: item.name,
            date: item.date.toISOString(),
            departmentId: item.departmentId,
          }}
        />
      </FormCard>
    </div>
  )
}
