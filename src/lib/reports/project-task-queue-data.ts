/**
 * Loader baca-saja antrean tugas proyek lewat tenggat belum selesai
 * (F-2026-10-27-091-S, 091-B+F).
 *
 * Fail-closed SEBELUM query (BR-PTQ-06, Q-PTQ-3): izin `view_projects`
 * — persis gerbang daftar tugas existing, tanpa key baru — ditegakkan
 * di sini sebelum query apa pun. Loader TIDAK menyaring per penugasan
 * tahap 1 (mewarisi daftar existing; batas itu dinyatakan di notice).
 * Status proyek induk TIDAK disaring (BR-PTQ-11/Q-PTQ-5).
 *
 * Anti-N+1 (BR-PTQ-12): satu query Task dengan relasi project +
 * assignee ter-include massal — bukan query per baris. Rekap dihitung
 * builder dari populasi penuh.
 *
 * Baca-saja mutlak (BR-PTQ-07): hanya `findMany`; tidak memanggil
 * aksi tulis tugas existing dan tidak menulis status/tenggat/
 * penugasan apa pun. Populasi/ember/umur/urutan/rekap di builder
 * murni `project-task-queue.ts`; query hanya mengecualikan status
 * terminal dan builder menyaring ulang (pola keluarga antrean).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildProjectTaskQueue,
  type ProjectTaskQueue,
  type ProjectTaskQueueInput,
} from "@/lib/reports/project-task-queue"

export interface ProjectTaskQueueOptions {
  now?: Date
  limit?: number
}

export async function getProjectTaskQueue(
  options: ProjectTaskQueueOptions = {},
): Promise<ProjectTaskQueue> {
  await requirePermission("view_projects")

  const tasks = await prisma.task.findMany({
    where: { status: { notIn: ["completed", "cancelled"] } },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      projectId: true,
      assignedTo: true,
      dueDate: true,
      startDate: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { name: true } },
      assignee: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const inputs: ProjectTaskQueueInput[] = tasks.map((task) => ({
    taskId: task.id,
    slug: task.slug,
    name: task.name,
    status: task.status,
    projectId: task.projectId,
    projectName: task.project?.name ?? null,
    assignedTo: task.assignedTo,
    assigneeName: task.assignee?.name ?? null,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    startDate: task.startDate,
    updatedAt: task.updatedAt,
  }))

  return buildProjectTaskQueue(inputs, options.now ?? new Date(), options.limit)
}
