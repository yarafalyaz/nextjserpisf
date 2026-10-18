export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppreciationForm } from "@/components/forms/appreciation-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Apresiasi" }

export default async function CreateAppreciationPage() {
  await requirePermission("create_appreciations")

  const employees = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Apresiasi Karyawan</h1>
      </div>
      <AppreciationForm employees={employees} />
    </div>
  )
}
