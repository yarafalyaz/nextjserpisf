export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { HolidayForm } from "../../../_components/work-calendar-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Hari Libur" }

export default async function EditHolidayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_holidays")
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const holiday = await prisma.holiday.findUnique({ where: { id } })
  if (!holiday) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ubah Hari Libur"
        subtitle={holiday.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Kalender Kerja", href: "/sdm/kalender-kerja" },
          { label: "Ubah Hari Libur" },
        ]}
      />
      <FormCard>
        <HolidayForm
          key={holiday.id}
          holiday={{
            id: holiday.id,
            name: holiday.name,
            date: holiday.date.toISOString(),
            description: holiday.description,
          }}
        />
      </FormCard>
    </div>
  )
}
