export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { EmptyState } from "@/components/ui/empty-state"
import { getSuccessionOverview } from "@/actions/succession.actions"
import {
  CriticalToggle,
  RemoveSuccessorButton,
  SuccessorForm,
} from "./_components/succession-actions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Perencanaan Suksesi" }

const READINESS_LABELS: Record<string, string> = {
  ready_now: "Siap Sekarang",
  ready_1_2_years: "Siap 1-2 Tahun",
  ready_future: "Siap Masa Depan",
}

const COVERAGE_LABELS: Record<string, string> = {
  covered: "Aman",
  at_risk: "Berisiko",
  vacant: "Kosong",
}

export default async function SuccessionPage() {
  await requirePermission("view_succession")

  const [overview, allPositions, employees] = await Promise.all([
    getSuccessionOverview(),
    prisma.position.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isCritical: true },
    }),
    prisma.employee.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const criticalPositions = allPositions.filter((p) => p.isCritical)
  const counts = {
    covered: overview.filter((o) => o.coverage === "covered").length,
    atRisk: overview.filter((o) => o.coverage === "at_risk").length,
    vacant: overview.filter((o) => o.coverage === "vacant").length,
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Perencanaan Suksesi" },
      ]} />
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Perencanaan Suksesi</h1>
        <p className="text-sm text-muted-foreground">
          {criticalPositions.length} jabatan kritis · {counts.covered} aman · {counts.atRisk} berisiko · {counts.vacant} kosong
        </p>
      </div>

      <CanCreate permission="create_succession">
        <SuccessorForm positions={criticalPositions} employees={employees} />
      </CanCreate>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Jabatan Kritis & Kandidat</h2>
        <div className="overflow-x-auto rounded-lg border border-default">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default bg-surface-secondary text-left">
                <th className="px-4 py-3 font-medium">Jabatan</th>
                <th className="px-4 py-3 font-medium">Departemen</th>
                <th className="px-4 py-3 font-medium">Pemegang Saat Ini</th>
                <th className="px-4 py-3 font-medium">Kandidat Pengganti</th>
                <th className="px-4 py-3 font-medium">Cakupan</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {overview.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <EmptyState title="Belum ada jabatan kritis." description="Tandai jabatan kritis pada daftar di bawah." className="py-0" />
                  </td>
                </tr>
              )}
              {overview.map((o) => (
                <tr key={o.positionId} className="border-b border-default last:border-0 align-top">
                  <td className="px-4 py-3 font-medium">{o.positionName}</td>
                  <td className="px-4 py-3">{o.departmentName ?? "-"}</td>
                  <td className="px-4 py-3">
                    {o.incumbents.length > 0 ? o.incumbents.map((i) => i.name).join(", ") : "Lowong"}
                  </td>
                  <td className="px-4 py-3">
                    {o.candidates.length === 0 ? (
                      "-"
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {o.candidates.map((c) => (
                          <li key={c.id} className="flex items-center gap-2">
                            <span>{c.rank}. {c.employeeName} ({READINESS_LABELS[c.readiness] ?? c.readiness})</span>
                            <RemoveSuccessorButton id={c.id} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">{COVERAGE_LABELS[o.coverage] ?? o.coverage}</td>
                  <td className="px-4 py-3">
                    <CriticalToggle positionId={o.positionId} isCritical={true} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Semua Jabatan</h2>
        <div className="overflow-x-auto rounded-lg border border-default">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default bg-surface-secondary text-left">
                <th className="px-4 py-3 font-medium">Jabatan</th>
                <th className="px-4 py-3 font-medium">Kritis</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {allPositions.map((p) => (
                <tr key={p.id} className="border-b border-default last:border-0">
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">{p.isCritical ? "Ya" : "Tidak"}</td>
                  <td className="px-4 py-3">
                    <CriticalToggle positionId={p.id} isCritical={p.isCritical} />
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
