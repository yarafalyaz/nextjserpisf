export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_projects")

  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id: Number(id) },
    include: {
      project: true,
      assignee: true,
    },
  })

  if (!task) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Tugas: ${task.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Projects", href: "/proyek" },
          { label: "Tasks", href: "/proyek/tugas" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={task.status} />}
        actions={
          <>
            <Button href={`/projects/tasks/${task.id}/edit`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <BackButton href="/proyek/tugas" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Tugas" value={task.name} />
        <DetailField
          label="Proyek"
          value={<Link href={`/projects/${task.project.id}`} className="text-primary hover:underline">{task.project.name}</Link>}
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
