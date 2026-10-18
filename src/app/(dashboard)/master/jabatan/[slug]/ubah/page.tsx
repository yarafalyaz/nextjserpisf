export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PositionCreateForm } from "../../tambah/form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Jabatan" }

export default async function EditPositionPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_positions")

  const { slug } = await params

  const position = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.position.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.position.findUnique({ where: { id } }),
    },
  )

  if (!position) notFound()

  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Jabatan", href: "/master/jabatan" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Jabatan: {position.name}</h1>
      </div>
      <PositionCreateForm departments={departments} position={position} />
    </div>
  )
}
