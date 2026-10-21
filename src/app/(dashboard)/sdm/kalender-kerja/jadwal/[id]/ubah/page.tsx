export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { WorkScheduleForm } from "../../../_components/work-calendar-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Jadwal Kerja" }

export default async function EditWorkSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_work_schedules")
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const schedule = await prisma.workSchedule.findUnique({ where: { id } })
  if (!schedule) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ubah Jadwal Kerja"
        subtitle={schedule.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Kalender Kerja", href: "/sdm/kalender-kerja" },
          { label: "Ubah Jadwal Kerja" },
        ]}
      />
      <FormCard>
        <WorkScheduleForm
          key={schedule.id}
          schedule={{
            id: schedule.id,
            name: schedule.name,
            workDays: schedule.workDays,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            isActive: schedule.isActive,
          }}
        />
      </FormCard>
    </div>
  )
}
