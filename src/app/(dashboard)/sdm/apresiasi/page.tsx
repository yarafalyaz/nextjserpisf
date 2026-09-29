import { MAX_LIST_ROWS } from "@/lib/constants/list-rows";
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Gift } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { AppreciationTable } from "./_components/appreciation-table"
import { CanCreate } from "@/components/auth/can-create"
import { statusToIndo, statusLabel, indoToStatus } from "@/lib/utils/status-labels"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Apresiasi" }

export default async function AppreciationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tipe?: string; cari?: string }>
}) {
  const user = await requirePermission("view_appreciations")

  const params = await searchParams

  const dbTypeParam = params.tipe ? indoToStatus[params.tipe] || params.tipe : undefined
  const where = {
    ...(params.cari && {
      OR: [
        { employee: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbTypeParam && { type: dbTypeParam }),
  }

  const appreciations = await prisma.appreciation.findMany({
    where,
    include: { employee: true },
    take: MAX_LIST_ROWS,
    orderBy: { date: "desc" },
  })

  const data = appreciations.map((a) => ({
    id: a.id,
    employee: { name: a.employee.name },
    date: a.date.toISOString(),
    type: a.type,
    amount: Number(a.amount),
    notes: a.notes,
  }))

  const statusChips = ["", "bonus", "reward", "incentive"].map((s) => {
    const urlTipe = s ? statusToIndo[s] : ""
    return (
      <Link key={s || "all"} href={`/sdm/apresiasi${urlTipe ? `?tipe=${urlTipe}` : ""}`} className={`filter-chip ${params.tipe === urlTipe || (!params.tipe && !urlTipe) ? "active" : ""}`}>
        {s ? statusLabel(s) : "Semua"}
      </Link>
    )
  })

  // Only show action column if user has permission to edit or delete appreciations
  const userRoles: string[] = user.roles ?? [];
  const userPerms: string[] = (user as any).permissions ?? [];
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("create_appreciations") ||
    userPerms.includes("delete_appreciations");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Apresiasi Karyawan</h1>
        <CanCreate permission="create_appreciations">
          <Link href="/sdm/apresiasi/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-appreciation-btn">
            <Gift size={16} /> Tambah Apresiasi
          </Link>
        </CanCreate>
      </div>

      <AppreciationTable
        data={data}
        showActions={showActions}
        toolbar={<AppSearchField placeholder="Cari nama karyawan..." action="/sdm/apresiasi" />}
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />
    </div>
  )
}
