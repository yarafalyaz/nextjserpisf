export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
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

export const RECRUITMENT_VALID_STATUSES = ["draft", "open", "closed"] as const

export interface RecruitmentsPageProps {
  statusParam?: string
  searchParams: Promise<{ status?: string }>
}

export async function renderRecruitmentsPage({
  statusParam,
  searchParams,
}: RecruitmentsPageProps) {
  await requirePermission("view_recruitments")
  const params = await searchParams

  if (!statusParam && params.status) {
    redirect(`/sdm/rekrutmen/status/${params.status}`)
  }

  if (statusParam && !RECRUITMENT_VALID_STATUSES.includes(statusParam as (typeof RECRUITMENT_VALID_STATUSES)[number])) {
    notFound()
  }

  const activeStatus = statusParam ?? ""

  const vacancies = await prisma.jobVacancy.findMany({
    where: {
      deletedAt: null,
      ...(activeStatus ? { status: activeStatus } : {}),
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
      <AppBreadcrumbs items={
        activeStatus
          ? [
              { label: "Dasbor", href: "/" },
              { label: "SDM", href: "/sdm" },
              { label: "Rekrutmen", href: "/sdm/rekrutmen" },
              { label: STATUS_LABELS[activeStatus] ?? activeStatus },
            ]
          : [
              { label: "Dasbor", href: "/" },
              { label: "SDM", href: "/sdm" },
              { label: "Rekrutmen" },
            ]
      } />
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
            href={s ? `/sdm/rekrutmen/status/${s}` : "/sdm/rekrutmen"}
            className={`filter-chip ${activeStatus === s ? "active" : ""}`}
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
                  <EmptyState title="Tidak ada lowongan" description="Belum ada data lowongan pekerjaan." />
                </td>
              </tr>
            )}
            {vacancies.map((v) => (
              <tr key={v.id} className="border-b border-default hover:bg-surface-secondary">
                <td className="px-4 py-3 font-mono text-xs">{v.code}</td>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/sdm/rekrutmen/${v.slug ?? v.id}`} className="hover:underline">
                    {v.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{v.department?.name ?? "-"}</td>
                <td className="px-4 py-3">{v.position?.name ?? "-"}</td>
                <td className="px-4 py-3">{v._count.applicants} pelamar</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    v.status === "open" ? "bg-success/15 text-success" :
                    v.status === "closed" ? "bg-muted text-muted-foreground" :
                    "bg-warning/15 text-warning"
                  }`}>
                    {STATUS_LABELS[v.status] ?? v.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function RecruitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  return renderRecruitmentsPage({ searchParams })
}
