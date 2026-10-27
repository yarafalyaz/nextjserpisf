export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import {
  ParticipantForm,
  ParticipantResultButtons,
  TrainingStatusButton,
} from "../_components/training-actions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Pelatihan" }

const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  registered: "Terdaftar",
  attended: "Hadir",
  absent: "Absen",
}

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_trainings")
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
        <TrainingStatusButton trainingId={training.id} status={training.status} />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Peserta ({training.participants.length})</h2>
        {training.status === "scheduled" && (
          <ParticipantForm trainingId={training.id} employees={employees} />
        )}
        <div className="overflow-x-auto rounded-lg border border-default">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default bg-surface-secondary text-left">
                <th className="px-4 py-3 font-medium">Karyawan</th>
                <th className="px-4 py-3 font-medium">NIP</th>
                <th className="px-4 py-3 font-medium">Kehadiran</th>
                <th className="px-4 py-3 font-medium">Skor</th>
                <th className="px-4 py-3 font-medium">Sertifikat</th>
                <th className="px-4 py-3 font-medium">Hasil</th>
              </tr>
            </thead>
            <tbody>
              {training.participants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Belum ada peserta.</td>
                </tr>
              )}
              {training.participants.map((p) => (
                <tr key={p.id} className="border-b border-default last:border-0">
                  <td className="px-4 py-3 font-medium">{p.employee.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.employee.employeeNo}</td>
                  <td className="px-4 py-3">{PARTICIPANT_STATUS_LABELS[p.status] ?? p.status}</td>
                  <td className="px-4 py-3">{p.score != null ? Number(p.score) : "-"}</td>
                  <td className="px-4 py-3">{p.certificateRef ?? "-"}</td>
                  <td className="px-4 py-3">
                    <ParticipantResultButtons participantId={p.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
