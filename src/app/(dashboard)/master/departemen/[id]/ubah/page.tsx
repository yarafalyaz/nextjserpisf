export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EditDepartmentForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditDepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const department = await prisma.department.findUnique({
    where: { id: Number(id) },
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
