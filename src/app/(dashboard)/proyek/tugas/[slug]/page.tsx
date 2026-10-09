export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

export const metadata: Metadata = { title: "Tugas" }

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_projects")

  const { slug } = await params

  const task = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.task.findFirst({ where: { slug: s }, include: { project: true, assignee: true } }),
      byId: (id) => prisma.task.findUnique({ where: { id }, include: { project: true, assignee: true } }),
    },
  )

  if (!task) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Tugas: ${task.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Proyek", href: "/proyek" },
          { label: "Tugas", href: "/proyek/tugas" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={task.status} />}
        actions={
          <>
            <CanCreate permission="edit_projects">
              <Button href={entityEditHref("/proyek/tugas", task)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <BackButton href="/proyek/tugas" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Tugas" value={task.name} />
        <DetailField
          label="Proyek"
          value={<Link href={entityHref("/proyek", task.project)} className="text-primary hover:underline">{task.project.name}</Link>}
        />
        <DetailField label="Status" value={<StatusChip status={task.status} />} />
        <DetailField label="Ditugaskan Ke" value={task.assignee?.name || "-"} />
        <DetailField label="Tanggal Mulai" value={task.startDate ? formatDate(task.startDate) : "-"} />
        <DetailField label="Tenggat" value={task.dueDate ? formatDate(task.dueDate) : "-"} />
        <DetailField label="Dibuat" value={formatDate(task.createdAt)} />
        <DetailField label="Diperbarui" value={formatDate(task.updatedAt)} />
        {task.description && (
          <DetailField label="Deskripsi" value={<span className="whitespace-pre-wrap">{task.description}</span>} colSpan="full" />
        )}
      </DetailCard>
    </div>
  )
}
