export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { HolidayForm } from "../../_components/work-calendar-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Hari Libur" }

export default async function CreateHolidayPage() {
  await requirePermission("create_holidays")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tambah Hari Libur"
        subtitle="Berlaku untuk seluruh perusahaan dan dipakai perhitungan absensi."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Kalender Kerja", href: "/sdm/kalender-kerja" },
          { label: "Tambah Hari Libur" },
        ]}
      />
      <FormCard>
        <HolidayForm />
      </FormCard>
    </div>
  )
}
