export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { HolidayEditForm } from "./form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Hari Libur" }

export default async function EditHolidayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("create_holidays")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.holiday.findUnique({ where: { id: numId } })
  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Hari Libur", href: "/sdm/hari-libur" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Hari Libur</h1>
      </div>
      <HolidayEditForm
        id={data.id}
        name={data.name}
        date={data.date.toISOString().split("T")[0]}
        description={data.description}
        isNationalHoliday={data.isNationalHoliday}
      />
    </div>
  )
}
