export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { WorkScheduleForm } from "../../_components/work-calendar-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Jadwal Kerja" }

export default async function CreateWorkSchedulePage() {
  await requirePermission("create_work_schedules")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tambah Jadwal Kerja"
        subtitle="Hari kerja di sini yang dibaca perhitungan absensi dan sisa cuti."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Kalender Kerja", href: "/sdm/kalender-kerja" },
          { label: "Tambah Jadwal Kerja" },
        ]}
      />
      <FormCard>
        <WorkScheduleForm />
      </FormCard>
    </div>
  )
}
