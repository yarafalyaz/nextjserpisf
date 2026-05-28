export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { LeaveForm } from "@/components/forms/leave-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateLeavePage() {
  await requirePermission("view_leave_requests")

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ajukan Cuti</h1>
      </div>
      <LeaveForm employees={employees} />
    </div>
  )
}
