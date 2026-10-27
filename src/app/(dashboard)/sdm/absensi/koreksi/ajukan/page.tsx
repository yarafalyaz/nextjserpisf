export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { AttendanceCorrectionForm } from "../../_components/attendance-correction-form"
import { getAttendanceEmployeeOptions } from "../../_components/attendance-data"

export const metadata: Metadata = { title: "Ajukan Koreksi Absensi" }

/**
 * F-2026-10-25-010-S: halaman pengajuan koreksi absensi. Daftar karyawan
 * dibatasi scope HR pemanggil (self = hanya dirinya); server action
 * menegakkan lagi pengaju = employeeId login untuk scope self.
 */
export default async function CreateAttendanceCorrectionPage() {
  const user = await requirePermission("create_attendance_corrections")
  const scope = await getHrScope(user)
  const employees = await getAttendanceEmployeeOptions(scope)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ajukan Koreksi Absensi"
        subtitle="Pengajuan menunggu putusan penyetuju dan tidak langsung mengubah rekod absensi."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Absensi", href: "/sdm/absensi" },
          { label: "Koreksi Absensi", href: "/sdm/absensi/koreksi" },
          { label: "Ajukan Koreksi Absensi" },
        ]}
      />
      <FormCard>
        <AttendanceCorrectionForm employees={employees} />
      </FormCard>
    </div>
  )
}
