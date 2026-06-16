export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { OvertimeForm } from "@/components/forms/overtime-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Lembur" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_employees")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.overtimeRequest.findUnique({
    where: { id: numId },
  })

  if (!data) notFound()

  const employees = await prisma.employee.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } })

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "SDM", href: "/sdm/lembur" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <OvertimeForm overtime={{ id: data.id, employeeId: data.employeeId, projectId: data.projectId, date: data.date.toISOString().split('T')[0], hours: Number(data.hours), reason: data.reason }} employees={employees} projects={projects} />
    </div>
  )
}
