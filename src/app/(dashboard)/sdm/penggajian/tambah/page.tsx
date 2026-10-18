export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PayrollForm } from "@/components/forms/payroll-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Penggajian" }

export default async function CreatePayrollPage() {
  await requirePermission("create_payroll")

  const [employees, costCenters] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.costCenter.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Proses Penggajian Karyawan</h1>
      </div>
      <PayrollForm employees={employees} costCenters={costCenters} />
    </div>
  )
}
