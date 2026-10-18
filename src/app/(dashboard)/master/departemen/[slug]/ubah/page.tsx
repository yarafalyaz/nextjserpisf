export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EditDepartmentForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Departemen" }

export default async function EditDepartmentPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_departments")

  const { slug } = await params

  const department = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.department.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.department.findUnique({ where: { id } }),
    },
  )

  if (!department) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Departemen", href: "/master/departemen" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Departemen: {department.name}</h1>
      </div>
      <EditDepartmentForm department={department} />
    </div>
  )
}
