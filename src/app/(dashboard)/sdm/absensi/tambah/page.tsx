export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { AttendanceForm } from "../_components/attendance-forms"
import { getAttendanceEmployeeOptions } from "../_components/attendance-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Catat Absensi" }

export default async function CreateAttendancePage() {
  const user = await requirePermission("create_attendance")
  const scope = await getHrScope(user)
  const employees = await getAttendanceEmployeeOptions(scope)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catat Absensi"
        subtitle="Satu karyawan hanya boleh punya satu absensi per tanggal."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Absensi", href: "/sdm/absensi" },
          { label: "Catat Absensi" },
        ]}
      />
      <FormCard>
        <AttendanceForm employees={employees} />
      </FormCard>
    </div>
  )
}
