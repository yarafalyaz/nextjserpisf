export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { CostCenterForm } from "@/components/forms/cost-center-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Pusat Biaya" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_cost_centers")

  const { slug } = await params

  const [data, costCenters] = await Promise.all([
    resolveEntity(
      { segment: slug, fallbackWhere: {} },
      {
        bySlug: (s) => prisma.costCenter.findFirst({ where: { slug: s } }),
        byId: (id) => prisma.costCenter.findUnique({ where: { id } }),
      },
    ),
    prisma.costCenter.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pusat Biaya", href: "/keuangan/pusat-biaya" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <CostCenterForm costCenter={{ id: data.id, code: data.code, name: data.name, description: data.description, isActive: data.isActive ?? undefined, parentId: data.parentId }} costCenters={costCenters} />
    </div>
  )
}
