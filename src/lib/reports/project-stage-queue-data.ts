/**
 * Loader baca-saja antrean tahap proyek berjalan tanpa progres baru
 * (F-2026-10-27-092-S, 092-B+F).
 *
 * Fail-closed SEBELUM query (BR-PSQ-07, Q-PSQ-3/5): izin
 * `view_projects` — persis gerbang halaman proyek existing, tanpa key
 * baru — ditegakkan di sini sebelum query apa pun. Status proyek
 * induk TIDAK disaring (BR-PSQ-08).
 *
 * Anti-N+1 (BR-PSQ-11): SATU query ProjectStage populasi dengan
 * relasi proyek+pelanggan ter-include massal dan progres terakhir
 * per tahap (`createdAt desc, id desc, take 1`, pola loader earned
 * value existing) — bukan query per baris. Rekap dihitung builder
 * dari populasi penuh. Catatan `notes` progres TIDAK dipilih
 * (BR-PSQ-12); nominal kontrak/anggaran TIDAK dipilih (BR-PSQ-09).
 *
 * Baca-saja mutlak (BR-PSQ-06): hanya `findMany`; tidak memanggil
 * aksi tulis tahap existing apa pun dan tidak menulis
 * status/stempel/rekod progres. Populasi/umur/tingkat/
 * urutan/rekap di builder murni `project-stage-queue.ts`; query
 * menyaring persis populasi dan builder menyaring ulang.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildProjectStageQueue,
  type ProjectStageQueue,
  type ProjectStageQueueInput,
} from "@/lib/reports/project-stage-queue"

export interface ProjectStageQueueOptions {
  now?: Date
  limit?: number
}

export async function getProjectStageQueue(
  options: ProjectStageQueueOptions = {},
): Promise<ProjectStageQueue> {
  await requirePermission("view_projects")

  const stages = await prisma.projectStage.findMany({
    where: { status: "in_progress" },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      status: true,
      startedAt: true,
      updatedAt: true,
      projectId: true,
      project: {
        select: {
          slug: true,
          name: true,
          status: true,
          customer: { select: { name: true } },
        },
      },
      progress: {
        select: { id: true, percentage: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  })

  const inputs: ProjectStageQueueInput[] = stages.map((stage) => ({
    stageId: stage.id,
    stageName: stage.name,
    sortOrder: stage.sortOrder,
    status: stage.status,
    startedAt: stage.startedAt,
    updatedAt: stage.updatedAt,
    projectId: stage.projectId,
    projectSlug: stage.project?.slug ?? null,
    projectName: stage.project?.name ?? null,
    projectStatus: stage.project?.status ?? null,
    customerName: stage.project?.customer?.name ?? null,
    progress: stage.progress.map((record) => ({
      id: record.id,
      percentage: record.percentage,
      createdAt: record.createdAt,
    })),
  }))

  return buildProjectStageQueue(inputs, options.now ?? new Date(), options.limit)
}
