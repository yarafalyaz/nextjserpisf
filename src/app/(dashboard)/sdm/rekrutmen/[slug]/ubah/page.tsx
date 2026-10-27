export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { VacancyForm } from "../../_components/vacancy-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Lowongan" }

export default async function EditVacancyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_recruitments")
  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.jobVacancy.findFirst({ where: { slug: s, deletedAt: null } }),
      byId: (id) => prisma.jobVacancy.findFirst({ where: { id, deletedAt: null } }),
    },
  )
  if (!data) notFound()

  const [departments, positions] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.position.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Rekrutmen", href: "/sdm/rekrutmen" },
        { label: "Ubah Lowongan" },
      ]} />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Lowongan</h1>
      <VacancyForm
        vacancy={{
          id: data.id,
          title: data.title,
          departmentId: data.departmentId,
          positionId: data.positionId,
          description: data.description,
          requirements: data.requirements,
          location: data.location,
          employmentType: data.employmentType,
          quota: data.quota,
        }}
        departments={departments}
        positions={positions}
      />
    </div>
  )
}
