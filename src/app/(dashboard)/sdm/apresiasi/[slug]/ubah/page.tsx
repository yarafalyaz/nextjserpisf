export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AppreciationForm } from "@/components/forms/appreciation-form"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Apresiasi" }

export default async function EditAppreciationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("create_appreciations")

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.appreciation.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.appreciation.findUnique({ where: { id } }),
    },
  )

  if (!data) notFound()

  const employees = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Apresiasi</h1>
      </div>
      <AppreciationForm
        employees={employees}
        appreciation={{
          id: data.id,
          employeeId: data.employeeId,
          date: data.date.toISOString().split("T")[0],
          type: data.type,
          amount: Number(data.amount),
          notes: data.notes,
        }}
      />
    </div>
  )
}
