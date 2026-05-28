export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { Gift } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { AppreciationTable } from "./_components/appreciation-table"

export default async function AppreciationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; search?: string }>
}) {
  await requirePermission("view_appreciations")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { employee: { name: { contains: params.search } } },
      ],
    }),
    ...(params.type && { type: params.type }),
  }

  const appreciations = await prisma.appreciation.findMany({
    where,
    include: { employee: true },
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Apresiasi Karyawan</h1>
        <Link href="/hrm/appreciations/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-appreciation-btn">
          <Gift size={16} /> Tambah Apresiasi
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama karyawan..." action="/hrm/appreciations" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "bonus", "reward", "incentive"].map((s) => (
              <Link key={s} href={`/hrm/appreciations?type=${s}`} className={`filter-chip ${params.type === s || (!params.type && !s) ? "active" : ""}`}>
                {s === "bonus" ? "Bonus" : s === "reward" ? "Reward" : s === "incentive" ? "Insentif" : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <AppreciationTable data={data} />
      </div>
    </div>
  )
}
