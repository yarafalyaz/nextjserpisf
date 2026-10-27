export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { VacancyForm } from "../_components/vacancy-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Lowongan" }

export default async function CreateVacancyPage() {
  await requirePermission("create_recruitments")

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
        { label: "Tambah Lowongan" },
      ]} />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Lowongan</h1>
      <VacancyForm departments={departments} positions={positions} />
    </div>
  )
}
