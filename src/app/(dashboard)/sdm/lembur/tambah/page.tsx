export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { OvertimeForm } from "@/components/forms/overtime-form"

export default async function CreateOvertimePage() {
  await requirePermission("view_overtime")

  const employees = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ajukan Lembur</h1>
      </div>
      <OvertimeForm employees={employees} projects={projects} />
    </div>
  )
}
