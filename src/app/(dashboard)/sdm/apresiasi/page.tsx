import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"

export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Gift, Plus, Coins, Banknote } from "@/components/ui/fontawesome-icons"
import { AppSearchField } from "@/components/ui/search-field"
import { AppreciationTable } from "./_components/appreciation-table"
import { CanCreate } from "@/components/auth/can-create"
import { statusToIndo, statusLabel, indoToStatus } from "@/lib/utils/status-labels"
import { formatCurrency } from "@/lib/utils/format"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Apresiasi" }

export default async function AppreciationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tipe?: string; cari?: string; halaman?: string; pageSize?: string }>
}) {
  const user = await requirePermission("view_appreciations")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const dbTypeParam = params.tipe ? indoToStatus[params.tipe] || params.tipe : undefined
  const where = {
    ...(params.cari && {
      OR: [
        { employee: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbTypeParam && { type: dbTypeParam }),
  }

  const [appreciations, total, typeGroups, amountAgg] = await Promise.all([
    prisma.appreciation.findMany({
      where,
      include: { employee: true },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { date: "desc" },
    }),
    prisma.appreciation.count({ where }),
    prisma.appreciation.groupBy({
      by: ["type"],
      _count: { id: true },
    }),
    prisma.appreciation.aggregate({
      _sum: {
        amount: true,
      },
    }),
  ])

  const counts: Record<string, number> = {
    all: typeGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    bonus: 0,
    reward: 0,
    incentive: 0,
  }
  for (const group of typeGroups) {
    if (group.type in counts) {
      counts[group.type] = group._count?.id ?? 0
    }
  }

  const totalAmountSum = Number(amountAgg._sum.amount ?? 0)

  const data = appreciations.map((a) => ({
    id: a.id,
    slug: a.slug,
    employee: { name: a.employee.name },
    date: a.date.toISOString(),
    type: a.type,
    amount: Number(a.amount),
    notes: a.notes,
  }))

  const statusChips = ["", "bonus", "reward", "incentive"].map((s) => {
    const urlTipe = s ? statusToIndo[s] : ""
    const isActive = params.tipe === urlTipe || (!params.tipe && !urlTipe)
    const count = s ? (counts[s] ?? 0) : counts.all

    return (
      <Link
        key={s || "all"}
        href={withListParams("/sdm/apresiasi", params, { tipe: urlTipe || undefined, halaman: undefined })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{s ? statusLabel(s) : "Semua"}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      </Link>
    )
  })

  // Only show action column if user has permission to edit or delete appreciations
  const userRoles: string[] = user.roles ?? [];
  const userPerms: string[] = user.permissions ?? [];
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("create_appreciations") ||
    userPerms.includes("delete_appreciations");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Apresiasi & Penghargaan Karyawan
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pemberian bonus kinerja, insentif target, dan penghargaan pencapaian istimewa karyawan.
          </p>
        </div>
        <CanCreate permission="create_appreciations">
          <Link
            href="/sdm/apresiasi/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-appreciation-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Apresiasi</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Apresiasi
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <Gift className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh pemberian penghargaan</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Bonus Kinerja
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.bonus}
            </span>
            <Coins className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Bonus performa berkala</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Reward & Insentif
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.reward + counts.incentive}
            </span>
            <Banknote className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Reward prestasi & insentif target</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Dana Apresiasi
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono tabular-nums">
              {formatCurrency(totalAmountSum)}
            </span>
            <Coins className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Akumulasi nilai apresiasi</span>
        </div>
      </div>

      <AppreciationTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        showActions={showActions}
        toolbar={<AppSearchField placeholder="Cari nama karyawan..." action="/sdm/apresiasi" />}
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />
    </div>
  )
}
