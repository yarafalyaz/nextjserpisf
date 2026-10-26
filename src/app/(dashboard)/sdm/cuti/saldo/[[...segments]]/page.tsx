export const dynamic = "force-dynamic"

import { notFound, redirect } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { prisma } from "@/lib/db/prisma"
import { getAllLeaveBalances } from "@/actions/hrm.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppSearchField } from "@/components/ui/search-field"
import Link from "next/link"
import {
  LeaveBalanceTable,
  type LeaveBalanceRow,
} from "../_components/leave-balance-table"
import { LeaveBalanceDepartmentFilter } from "../_components/leave-balance-department-filter"
import { LeaveBalanceExportButton } from "../_components/leave-balance-export-button"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Saldo Cuti" }

/**
 * Segmen path `tahun/<YYYY>` dan `departemen/<id>` → filter saldo yang
 * ditampilkan. Kunci tak dikenal atau nilai rusak adalah URL salah (404),
 * pola halaman periode lain. Tanpa segmen = tahun berjalan, semua
 * departemen dalam scope. `?cari=` tetap query (filter daftar).
 */
function parseSegments(segments: string[] | undefined): { tahun?: number; departemen?: number } {
  if (!segments?.length) return {}
  if (segments.length % 2 !== 0) notFound()
  const parsed: { tahun?: number; departemen?: number } = {}
  for (let i = 0; i < segments.length; i += 2) {
    const key = segments[i]
    const value = segments[i + 1]
    if (key === "tahun" && /^\d{4}$/.test(value)) parsed.tahun = Number(value)
    else if (key === "departemen" && /^\d+$/.test(value) && Number(value) > 0) parsed.departemen = Number(value)
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
  const scope = await getHrScope(user)

  const params = await searchParams
  const { segments } = await routeParams
  const { tahun, departemen } = parseSegments(segments)

  // Tautan lama `?tahun=<YYYY>` → bentuk path (filter cari dipertahankan).
  if (params.tahun !== undefined && tahun === undefined) {
    const legacy = /^\d{4}$/.test(params.tahun)
      ? `/sdm/cuti/saldo/tahun/${params.tahun}`
      : "/sdm/cuti/saldo"
    redirect(params.cari ? `${legacy}?cari=${encodeURIComponent(params.cari)}` : legacy)
  }

  const now = new Date()
  const year = tahun ?? now.getFullYear()

  // AC-LVB-F1: pemilih departemen hanya ditawarkan scope `all`; untuk scope
  // lain nilai departemen dari URL tidak diteruskan ke server.
  const showDepartmentFilter = scope.kind === "all"
  const departmentId = showDepartmentFilter ? (departemen ?? null) : null

  const [result, departments] = await Promise.all([
    getAllLeaveBalances(year, { departmentId }),
    showDepartmentFilter
      ? prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: number; name: string }[]),
  ])

  // DataTable keys each row on `id`; map employeeId → id.
  const allBalances: LeaveBalanceRow[] = result.success
    ? result.balances.map((b) => ({ ...b, id: b.employeeId }))
    : []

  // Pencarian nama/no. karyawan menyaring tampilan; angka ringkasan tetap
  // `totals` server untuk scope + filter departemen aktif (nol hitung ulang).
  const cari = params.cari?.trim().toLowerCase()
  const balances = cari
    ? allBalances.filter(
        (b) =>
          b.name.toLowerCase().includes(cari) ||
          b.employeeNo.toLowerCase().includes(cari),
      )
    : allBalances

  // BR-LVB-14: visibilitas kolom identitas dari server (scope efektif).
  const showIdentityColumns = result.success ? result.showIdentityColumns : scope.kind !== "self"

  const totals = result.success ? result.totals : null
  const stats = totals
    ? [
        {
          label: "Karyawan Berhak",
          value: String(totals.eligibleCount),
          hint: `${totals.notEligibleCount} belum genap 1 tahun${totals.inactiveCount ? ` · ${totals.inactiveCount} nonaktif` : ""}`,
        },
        { label: "Total Jatah", value: `${totals.totalEntitled} hari`, hint: `${year}` },
        {
          label: "Total Terpakai",
          value: `${totals.totalUsed} hari`,
          hint: `Disetujui ${totals.totalUsedApproved} hari · Menunggu ${totals.totalUsedPending} hari`,
        },
        { label: "Total Sisa", value: `${totals.totalRemaining} hari`, hint: "Hangus akhir tahun" },
      ]
    : []

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]
  const yearHref = (y: number) =>
    departmentId
      ? `/sdm/cuti/saldo/tahun/${y}/departemen/${departmentId}`
      : `/sdm/cuti/saldo/tahun/${y}`
  const currentPath = departmentId ? yearHref(year) : `/sdm/cuti/saldo/tahun/${year}`

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Cuti", href: "/sdm/cuti" },
          { label: "Saldo Cuti" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Saldo Cuti Karyawan</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {yearOptions.map((y) => (
            <Link
              key={y}
              href={params.cari ? `${yearHref(y)}?cari=${encodeURIComponent(params.cari)}` : yearHref(y)}
              className={`filter-chip ${year === y ? "active" : ""}`}
            >
              {y}
            </Link>
          ))}
          <LeaveBalanceExportButton year={year} departmentId={departmentId} />
        </div>
      </div>

      {!result.success ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {result.error || "Gagal memuat saldo cuti"}
        </div>
      ) : null}

      {showDepartmentFilter ? (
        <LeaveBalanceDepartmentFilter year={year} departmentId={departmentId} departments={departments} />
      ) : null}

      {result.success ? (
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
      ) : null}

      {result.success ? (
        <LeaveBalanceTable
          data={balances}
          showIdentityColumns={showIdentityColumns}
          toolbar={
            <AppSearchField
              placeholder="Cari nama / no. karyawan..."
              action={currentPath}
            />
          }
        />
      ) : null}
    </div>
  )
}
