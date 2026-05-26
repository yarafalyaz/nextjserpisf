export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppreciationForm } from "@/components/forms/appreciation-form"

export default async function CreateAppreciationPage() {
  await requirePermission("view_appreciations")

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Apresiasi Karyawan</h1>
      </div>
      <AppreciationForm employees={employees} />
    </div>
  )
}
