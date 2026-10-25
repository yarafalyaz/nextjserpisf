export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { CycleForm, CycleStatusButton } from "./_components/cycle-actions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penilaian Kinerja" }

const STATUS_LABELS: Record<string, string> = {
  draft: "Konsep",
  active: "Aktif",
  closed: "Ditutup",
}

function formatDate(d: Date) {
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export default async function PerformancePage() {
  await requirePermission("view_performance")

  const cycles = await prisma.performanceCycle.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { reviews: true, goals: true } } },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Penilaian Kinerja" },
      ]} />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Penilaian Kinerja</h1>

      <CanCreate permission="create_performance">
        <CycleForm />
      </CanCreate>

      <div className="overflow-x-auto rounded-lg border border-default">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-surface-secondary text-left">
              <th className="px-4 py-3 font-medium">Siklus</th>
              <th className="px-4 py-3 font-medium">Periode</th>
              <th className="px-4 py-3 font-medium">Ulasan</th>
              <th className="px-4 py-3 font-medium">Sasaran</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {cycles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Belum ada siklus penilaian.</td>
              </tr>
            )}
            {cycles.map((c) => (
              <tr key={c.id} className="border-b border-default last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/sdm/kinerja/${c.slug ?? c.id}`} className="font-medium hover:underline">{c.name}</Link>
                </td>
                <td className="px-4 py-3">{formatDate(c.periodStart)} – {formatDate(c.periodEnd)}</td>
                <td className="px-4 py-3">{c._count.reviews}</td>
                <td className="px-4 py-3">{c._count.goals}</td>
                <td className="px-4 py-3">{STATUS_LABELS[c.status] ?? c.status}</td>
                <td className="px-4 py-3">
                  <CycleStatusButton cycleId={c.id} status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
