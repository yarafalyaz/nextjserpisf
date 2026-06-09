/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { getSystemSettings } from "@/lib/utils/settings"
import { TimesheetForm } from "@/components/forms/timesheet-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Lembar Waktu" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.timesheet.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const [employees, projects, settings] = await Promise.all([prisma.employee.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }), prisma.project.findMany({ orderBy: { name: "asc" } }), getSystemSettings()])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "SDM", href: "/sdm/lembar-waktu" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <TimesheetForm timesheet={data as any} employees={employees as any} projects={projects as any} breakStart={settings.restBreakStart ?? null} breakEnd={settings.restBreakEnd ?? null}/>
    </div>
  )
}
