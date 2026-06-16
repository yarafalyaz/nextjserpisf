export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PositionCreateForm } from "../../tambah/form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Jabatan" }

export default async function EditPositionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_positions")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const position = await prisma.position.findUnique({
    where: { id: numId },
  })

  if (!position) notFound()

  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Jabatan", href: "/master/jabatan" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Jabatan: {position.name}</h1>
      </div>
      <PositionCreateForm departments={departments} position={position} />
    </div>
  )
}
