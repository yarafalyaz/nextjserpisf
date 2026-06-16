export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EditDepartmentForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Departemen" }

export default async function EditDepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_departments")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const department = await prisma.department.findUnique({
    where: { id: numId },
  })

  if (!department) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Departemen", href: "/master/departemen" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Departemen: {department.name}</h1>
      </div>
      <EditDepartmentForm department={department} />
    </div>
  )
}
