export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { EmployeeLoanForm } from "@/components/forms/employee-loan-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ajukan Pinjaman" }

export default async function CreateMyLoanRequestPage() {
  const user = await requirePermission("create_employee_loan_requests")
  const scope = await getHrScope(user)

  // Karyawan mengajukan HANYA untuk dirinya: pemilih karyawan dikunci ke
  // employee tertaut user login (form existing menampilkan pemilih terkunci
  // bila daftar berisi tepat 1 karyawan). Server tetap memaksa self.
  const ownEmployeeId =
    scope.kind === "self"
      ? scope.employeeId
      : (
          await prisma.employee.findFirst({
            where: { userId: Number(user.id) },
            select: { id: true },
          })
        )?.id

  if (ownEmployeeId == null) notFound()

  const employee = await prisma.employee.findUnique({
    where: { id: ownEmployeeId },
    select: { id: true, name: true },
  })
  if (!employee) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ajukan Pinjaman</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Pengajuan dibuat atas nama Anda dan berstatus menunggu persetujuan. Persetujuan
        dilakukan oleh SDM — Anda tidak dapat mengubah atau menghapus pengajuan dari halaman ini.
      </p>
      <EmployeeLoanForm employees={[employee]} redirectTo="/sdm/pinjaman-saya" />
    </div>
  )
}
