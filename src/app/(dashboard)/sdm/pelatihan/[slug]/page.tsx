export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { EmptyState } from "@/components/ui/empty-state"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import {
  ParticipantForm,
  TrainingStatusButton,
} from "../_components/training-actions"
import { TrainingParticipantsTable } from "./_components/training-participants-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Pelatihan" }

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_trainings")
  const canEdit = await hasPermission("edit_trainings")
  const { slug } = await params

  const training = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.training.findFirst({
          where: { slug: s, deletedAt: null },
          include: {
            participants: {
              orderBy: { createdAt: "asc" },
              include: { employee: { select: { name: true, employeeNo: true } } },
            },
          },
        }),
      byId: (id) =>
        prisma.training.findFirst({
          where: { id, deletedAt: null },
          include: {
            participants: {
              orderBy: { createdAt: "asc" },
              include: { employee: { select: { name: true, employeeNo: true } } },
            },
          },
        }),
    },
  )
  if (!training) notFound()

  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Pelatihan", href: "/sdm/pelatihan" },
        { label: training.title },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{training.title}</h1>
          <p className="text-sm text-muted-foreground">
            {training.provider ?? "-"} · {training.startDate.toLocaleDateString("id-ID")}
            {training.endDate ? ` – ${training.endDate.toLocaleDateString("id-ID")}` : ""} · {training.location ?? "-"}
          </p>
        </div>
        <TrainingStatusButton trainingId={training.id} status={training.status} canEdit={canEdit} />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Peserta ({training.participants.length})</h2>
        {training.status === "scheduled" && (
          <ParticipantForm trainingId={training.id} employees={employees} canEdit={canEdit} />
        )}
        {training.participants.length === 0 ? (
          <EmptyState title="Belum ada peserta." className="py-10" />
        ) : (
          <TrainingParticipantsTable
            data={training.participants.map((p) => ({
              id: p.id,
              employeeName: p.employee.name,
              employeeNo: p.employee.employeeNo,
              status: p.status,
              score: p.score != null ? Number(p.score) : null,
              certificateRef: p.certificateRef,
            }))}
            canEdit={canEdit}
          />
        )}
      </section>
    </div>
  )
}
