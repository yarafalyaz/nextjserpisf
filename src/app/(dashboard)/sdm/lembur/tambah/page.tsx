export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { OvertimeForm } from "@/components/forms/overtime-form"
import { getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Lembur" }

export default async function CreateOvertimePage() {
  const user = await requirePermission("create_overtime_requests")
  const scope = await getHrScope(user)

  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...hrEmployeeScopeWhere(scope),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ajukan Lembur</h1>
      </div>
      <OvertimeForm employees={employees} projects={projects} />
    </div>
  )
}
