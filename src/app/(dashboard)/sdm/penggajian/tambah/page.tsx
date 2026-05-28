export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PayrollForm } from "@/components/forms/payroll-form"

export default async function CreatePayrollPage() {
  await requirePermission("create_payroll")

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Proses Payroll Karyawan</h1>
      </div>
      <PayrollForm employees={employees} />
    </div>
  )
}
