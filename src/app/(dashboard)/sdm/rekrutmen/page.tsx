export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/button"
import { CanCreate } from "@/components/auth/can-create"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rekrutmen" }

const STATUS_LABELS: Record<string, string> = {
  draft: "Konsep",
  open: "Terbuka",
  closed: "Ditutup",
}

export default async function RecruitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requirePermission("view_recruitments")
  const params = await searchParams

  const vacancies = await prisma.jobVacancy.findMany({
    where: {
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
    },
    include: {
      department: { select: { name: true } },
      position: { select: { name: true } },
      _count: { select: { applicants: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const chips = ["", "draft", "open", "closed"]

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Rekrutmen" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Rekrutmen</h1>
        <CanCreate permission="create_recruitments">
          <Button href="/sdm/rekrutmen/tambah">Tambah Lowongan</Button>
        </CanCreate>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((s) => (
          <Link
            key={s || "all"}
            href={s ? `/sdm/rekrutmen?status=${s}` : "/sdm/rekrutmen"}
            className={`filter-chip ${(params.status ?? "") === s ? "active" : ""}`}
          >
            {s ? STATUS_LABELS[s] : "Semua"}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-default">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-surface-secondary text-left">
              <th className="px-4 py-3 font-medium">Kode</th>
              <th className="px-4 py-3 font-medium">Lowongan</th>
              <th className="px-4 py-3 font-medium">Departemen</th>
              <th className="px-4 py-3 font-medium">Jabatan</th>
              <th className="px-4 py-3 font-medium">Pelamar</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {vacancies.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8">
                  <EmptyState title="Belum ada lowongan." className="py-0" />
                </td>
              </tr>
            )}
            {vacancies.map((v) => (
              <tr key={v.id} className="border-b border-default last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{v.code}</td>
                <td className="px-4 py-3">
                  <Link href={`/sdm/rekrutmen/${v.slug ?? v.id}`} className="font-medium hover:underline">
                    {v.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{v.department?.name ?? "-"}</td>
                <td className="px-4 py-3">{v.position?.name ?? "-"}</td>
                <td className="px-4 py-3">{v._count.applicants}</td>
                <td className="px-4 py-3">{STATUS_LABELS[v.status] ?? v.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
