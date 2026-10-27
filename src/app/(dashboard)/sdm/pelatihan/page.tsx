export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { EmptyState } from "@/components/ui/empty-state"
import { TrainingForm } from "./_components/training-actions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pelatihan" }

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Terjadwal",
  done: "Selesai",
  cancelled: "Dibatalkan",
}

export default async function TrainingsPage() {
  await requirePermission("view_trainings")

  const trainings = await prisma.training.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { participants: true } } },
    orderBy: { startDate: "desc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Pelatihan" },
      ]} />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pelatihan & Pengembangan</h1>

      <CanCreate permission="create_trainings">
        <TrainingForm />
      </CanCreate>

      <div className="overflow-x-auto rounded-lg border border-default">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-surface-secondary text-left">
              <th className="px-4 py-3 font-medium">Pelatihan</th>
              <th className="px-4 py-3 font-medium">Penyelenggara</th>
              <th className="px-4 py-3 font-medium">Mulai</th>
              <th className="px-4 py-3 font-medium">Peserta</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {trainings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8"><EmptyState title="Belum ada pelatihan." className="py-0" /></td>
              </tr>
            )}
            {trainings.map((t) => (
              <tr key={t.id} className="border-b border-default last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/sdm/pelatihan/${t.slug ?? t.id}`} className="font-medium hover:underline">{t.title}</Link>
                </td>
                <td className="px-4 py-3">{t.provider ?? "-"}</td>
                <td className="px-4 py-3">{t.startDate.toLocaleDateString("id-ID")}</td>
                <td className="px-4 py-3">{t._count.participants}</td>
                <td className="px-4 py-3">{STATUS_LABELS[t.status] ?? t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
