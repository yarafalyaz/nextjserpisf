export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PositionCreateForm } from "../../tambah/form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPositionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const position = await prisma.position.findUnique({
    where: { id: Number(id) },
  })

  if (!position) notFound()

  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Positions", href: "/master/jabatan" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Jabatan: {position.name}</h1>
      </div>
      <PositionCreateForm departments={departments as any} position={position} />
    </div>
  )
}
