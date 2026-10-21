export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { AttendanceForm } from "../../_components/attendance-forms"
import {
  getAttendanceEmployeeOptions,
  wibDateInputValue,
  wibTimeLabel,
} from "../../_components/attendance-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Absensi" }

export default async function EditAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const user = await requirePermission("edit_attendance")
  const scope = await getHrScope(user)

  const [employees, existing] = await Promise.all([
    getAttendanceEmployeeOptions(scope),
    prisma.attendance.findFirst({
      // Dibatasi jangkauan akses: baris di luar jangkauan tidak boleh terbuka
      // di formulir meski id-nya ditebak dari URL (aksinya juga menolak).
      where: { id, ...hrScopeWhere(scope) },
      select: {
        id: true,
        employeeId: true,
        date: true,
        checkIn: true,
        checkOut: true,
        status: true,
        notes: true,
        employee: { select: { id: true, name: true, employeeNo: true } },
      },
    }),
  ])
  if (!existing) notFound()

  // Karyawan yang diubah bisa NONAKTIF (atau berhenti), jadi ia mungkin tidak
  // ada di daftar karyawan aktif — tanpa penggabungan ini dropdown tampil
  // kosong dan menyimpan justru mengosongkan karyawannya.
  const employeeOptions = [...employees]
  if (!employeeOptions.some((employee) => employee.id === existing.employeeId)) {
    employeeOptions.push(existing.employee)
  }

  const item = {
    id: existing.id,
    employeeId: existing.employeeId,
    date: wibDateInputValue(existing.date),
    checkIn: existing.checkIn ? wibTimeLabel(existing.checkIn) : "",
    checkOut: existing.checkOut ? wibTimeLabel(existing.checkOut) : "",
    status: existing.status,
    notes: existing.notes ?? "",
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ubah Absensi"
        subtitle={`Kehadiran ${existing.employee.name} (${existing.employee.employeeNo}).`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Absensi", href: "/sdm/absensi" },
          { label: "Ubah Absensi" },
        ]}
      />
      <FormCard>
        <AttendanceForm key={item.id} employees={employeeOptions} item={item} />
      </FormCard>
    </div>
  )
}
