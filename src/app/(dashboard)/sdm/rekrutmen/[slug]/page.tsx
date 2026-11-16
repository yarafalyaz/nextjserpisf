export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/button"
import { CanCreate } from "@/components/auth/can-create"
import { EmptyState } from "@/components/ui/empty-state"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { ApplicantForm } from "../_components/applicant-form"
import { VacancyStatusButton } from "../_components/applicant-actions"
import { VacancyApplicantsTable } from "./_components/vacancy-applicants-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Lowongan" }

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Terbuka",
  closed: "Ditutup",
}

export default async function VacancyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_recruitments")
  const canEdit = await hasPermission("edit_recruitments")
  const { slug } = await params

  const vacancy = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.jobVacancy.findFirst({
          where: { slug: s, deletedAt: null },
          include: {
            department: { select: { name: true } },
            position: { select: { name: true } },
            applicants: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              include: {
                hiredEmployee: { select: { id: true, employeeNo: true, slug: true } },
              },
            },
          },
        }),
      byId: (id) =>
        prisma.jobVacancy.findFirst({
          where: { id, deletedAt: null },
          include: {
            department: { select: { name: true } },
            position: { select: { name: true } },
            applicants: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              include: {
                hiredEmployee: { select: { id: true, employeeNo: true, slug: true } },
              },
            },
          },
        }),
    },
  )

  if (!vacancy) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Rekrutmen", href: "/sdm/rekrutmen" },
        { label: vacancy.title },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{vacancy.title}</h1>
          <p className="text-sm text-muted-foreground">
            {vacancy.code} · {vacancy.department?.name ?? "-"} · {vacancy.position?.name ?? "-"} · Status: {STATUS_LABELS[vacancy.status] ?? vacancy.status}
          </p>
        </div>
        <div className="flex gap-2">
          <VacancyStatusButton vacancyId={vacancy.id} status={vacancy.status} canEdit={canEdit} />
          <CanCreate permission="edit_recruitments">
            <Button href={`/sdm/rekrutmen/${vacancy.slug ?? vacancy.id}/ubah`} variant="secondary">Ubah</Button>
          </CanCreate>
        </div>
      </div>

      {(vacancy.description || vacancy.requirements) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {vacancy.description && (
            <section className="rounded-lg border border-default p-4">
              <h2 className="font-semibold mb-2">Deskripsi</h2>
              <p className="text-sm whitespace-pre-wrap">{vacancy.description}</p>
            </section>
          )}
          {vacancy.requirements && (
            <section className="rounded-lg border border-default p-4">
              <h2 className="font-semibold mb-2">Persyaratan</h2>
              <p className="text-sm whitespace-pre-wrap">{vacancy.requirements}</p>
            </section>
          )}
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Pelamar ({vacancy.applicants.length})</h2>

        {vacancy.status === "open" && (
          <CanCreate permission="create_recruitments">
            <ApplicantForm vacancyId={vacancy.id} />
          </CanCreate>
        )}

        {vacancy.applicants.length === 0 ? (
          <EmptyState title="Belum ada pelamar." className="py-10" />
        ) : (
          <VacancyApplicantsTable
            data={vacancy.applicants.map((a) => ({
              id: a.id,
              name: a.name,
              email: a.email,
              phone: a.phone,
              source: a.source,
              stage: a.stage,
              hiredEmployee: a.hiredEmployee,
            }))}
            canEdit={canEdit}
          />
        )}
      </section>
    </div>
  )
}
