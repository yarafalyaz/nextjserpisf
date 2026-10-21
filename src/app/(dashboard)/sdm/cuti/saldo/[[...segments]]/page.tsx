export const dynamic = "force-dynamic"

import { notFound, redirect } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { getAllLeaveBalances } from "@/actions/hrm.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppSearchField } from "@/components/ui/search-field"
import Link from "next/link"
import {
  LeaveBalanceTable,
  type LeaveBalanceRow,
} from "../_components/leave-balance-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Saldo Cuti" }

/**
 * Segmen path `tahun/<YYYY>` → tahun saldo yang ditampilkan. Kunci tak
 * dikenal atau nilai rusak adalah URL salah (404), pola halaman periode
 * lain. Tanpa segmen = tahun berjalan. `?cari=` tetap query (filter daftar).
 */
function parseSegments(segments: string[] | undefined): { tahun?: number } {
  if (!segments?.length) return {}
  if (segments.length % 2 !== 0) notFound()
  const parsed: { tahun?: number } = {}
  for (let i = 0; i < segments.length; i += 2) {
    const key = segments[i]
    const value = segments[i + 1]
    if (key === "tahun" && /^\d{4}$/.test(value)) parsed.tahun = Number(value)
    else notFound()
  }
  return parsed
}

export default async function LeaveBalancePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tahun?: string; cari?: string }>
}) {
  const user = await requirePermission("view_leave_requests")

  const params = await searchParams
  const { segments } = await routeParams
  const { tahun } = parseSegments(segments)

  // Tautan lama `?tahun=<YYYY>` → bentuk path (filter cari dipertahankan).
  if (params.tahun !== undefined && tahun === undefined) {
    const legacy = /^\d{4}$/.test(params.tahun)
      ? `/sdm/cuti/saldo/tahun/${params.tahun}`
      : "/sdm/cuti/saldo"
    redirect(params.cari ? `${legacy}?cari=${encodeURIComponent(params.cari)}` : legacy)
  }

  const now = new Date()
  const year = tahun ?? now.getFullYear()

  const result = await getAllLeaveBalances(year)
  // DataTable keys each row on `id`; map employeeId → id.
  const allBalances: LeaveBalanceRow[] = result.success
    ? result.balances.map((b) => ({ ...b, id: b.employeeId }))
    : []

  // Server-side name/employeeNo filter (the dashboard table itself is client
  // paginated; filtering here keeps the row count sane for large rosters).
  const cari = params.cari?.trim().toLowerCase()
  const balances = cari
    ? allBalances.filter(
        (b) =>
          b.name.toLowerCase().includes(cari) ||
          b.employeeNo.toLowerCase().includes(cari),
      )
    : allBalances

  const eligible = allBalances.filter((b) => b.eligible)
  const totalEntitled = eligible.reduce((s, b) => s + b.entitled, 0)
  const totalUsed = eligible.reduce((s, b) => s + b.used, 0)
  const totalRemaining = eligible.reduce((s, b) => s + b.remaining, 0)
  const notEligibleCount = allBalances.length - eligible.length

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]

  const stats = [
    { label: "Karyawan Berhak", value: String(eligible.length), hint: `${notEligibleCount} belum genap 1 tahun` },
    { label: "Total Jatah", value: `${totalEntitled} hari`, hint: `${year}` },
    { label: "Total Terpakai", value: `${totalUsed} hari`, hint: "Cuti tahunan disetujui + menunggu" },
    { label: "Total Sisa", value: `${totalRemaining} hari`, hint: "Hangus akhir tahun" },
  ]

  // Hide Karyawan/Departemen columns for non-privileged users
  const userPerms: string[] = (user as any).permissions ?? [];
  const userRoles: string[] = user.roles ?? [];
  const showEmployeeColumn =
    userRoles.includes("super_admin") ||
    userPerms.includes("edit_leave_requests") ||
    userPerms.includes("delete_leave_requests");

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Cuti", href: "/sdm/cuti" },
          { label: "Cuti", href: "/sdm/cuti" },
          { label: "Saldo Cuti" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Saldo Cuti Karyawan</h1>
        <div className="flex flex-wrap gap-1.5">
          {yearOptions.map((y) => (
            <Link
              key={y}
              href={`/sdm/cuti/saldo/tahun/${y}`}
              className={`filter-chip ${year === y ? "active" : ""}`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-5 flex flex-col gap-1"
          >
            <span className="text-sm text-muted-foreground">{s.label}</span>
            <span className="text-2xl font-bold text-foreground">{s.value}</span>
            <span className="text-xs text-muted-foreground">{s.hint}</span>
          </div>
        ))}
      </div>

      <LeaveBalanceTable
        data={balances}
        showEmployeeColumn={showEmployeeColumn}
        toolbar={
          <AppSearchField
            placeholder="Cari nama / no. karyawan..."
            action="/sdm/cuti/saldo"
          />
        }
      />
    </div>
  )
}
