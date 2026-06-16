export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { getAllLeaveBalances } from "@/actions/hrm.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppSearchField } from "@/components/ui/search-field"
import Link from "next/link"
import {
  LeaveBalanceTable,
  type LeaveBalanceRow,
} from "./_components/leave-balance-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Saldo Cuti" }

export default async function LeaveBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ tahun?: string; cari?: string }>
}) {
  await requirePermission("view_leave_requests")

  const params = await searchParams
  const now = new Date()
  const year =
    params.tahun && /^\d{4}$/.test(params.tahun)
      ? Number(params.tahun)
      : now.getFullYear()

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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm/cuti" },
          { label: "Cuti", href: "/sdm/cuti" },
          { label: "Saldo Cuti" },
        ]}
      />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Saldo Cuti Karyawan</h1>
        <div className="flex flex-wrap gap-1.5">
          {yearOptions.map((y) => (
            <Link
              key={y}
              href={`/sdm/cuti/saldo?tahun=${y}`}
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
            className="bg-surface rounded-xl border border-default shadow-sm p-5 flex flex-col gap-1"
          >
            <span className="text-sm text-muted-foreground">{s.label}</span>
            <span className="text-2xl font-bold text-foreground">{s.value}</span>
            <span className="text-xs text-muted-foreground">{s.hint}</span>
          </div>
        ))}
      </div>

      <LeaveBalanceTable
        data={balances}
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
