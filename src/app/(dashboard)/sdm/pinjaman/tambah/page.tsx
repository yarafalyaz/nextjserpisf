export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { EmployeeLoanForm } from "@/components/forms/employee-loan-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pinjaman" }

export default async function CreateLoanPage() {
  await requirePermission("view_employee_loans")

  const employees = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Pinjaman Karyawan</h1>
      </div>
      <EmployeeLoanForm employees={employees} />
    </div>
  )
}
