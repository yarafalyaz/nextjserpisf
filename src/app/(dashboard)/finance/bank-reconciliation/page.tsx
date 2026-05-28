import { Eye, Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from '@/components/ui/status-chip'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function BankReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  await requirePermission("view_bank_reconciliation")

  const params = await searchParams
  const page = Number(params.page) || 1
  const perPage = 20

  const where = {
    ...(params.status && { status: params.status }),
  }

  const [reconciliations, total] = await Promise.all([
    prisma.bankReconciliation.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.bankReconciliation.count({ where }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Finance", href: "/finance" },
  { label: "Bank Reconciliation" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Bank Reconciliation</h1>
        <Link href="/finance/bank-reconciliation/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-recon-btn">
          + Buat Rekonsiliasi
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "completed"].map((s) => (
              <Link key={s} href={`/finance/bank-reconciliation?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Tanggal Statement</DetailTableTh>
              <DetailTableTh>Saldo Statement</DetailTableTh>
              <DetailTableTh>Matched Items</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Dibuat</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {reconciliations.length === 0 ? (
                <DetailTableRow><DetailTableTd colSpan={6} className="text-center py-10 px-4 text-muted">Tidak ada data rekonsiliasi</DetailTableTd></DetailTableRow>
              ) : (
                reconciliations.map((r) => (
                  <DetailTableRow key={r.id}>
                    <DetailTableTd>{formatDate(r.statementDate)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(r.statementBalance))}</DetailTableTd>
                    <DetailTableTd>{r.items.filter((i) => i.matched).length} / {r.items.length}</DetailTableTd>
                    <DetailTableTd><StatusChip status={r.status} /></DetailTableTd>
                    <DetailTableTd>{formatDate(r.createdAt)}</DetailTableTd>
                    <DetailTableTd>
                      <Link href={`/finance/bank-reconciliation/${r.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost">Eye</Link>
                    </DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 px-5 border-t border-default">
            <span className="text-[0.8125rem] text-muted">Hal {page} dari {totalPages} ({total} data)</span>
            <div className="flex gap-1">
              {page > 1 && <Link href={`/finance/bank-reconciliation?page=${page - 1}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost">← Prev</Link>}
              {page < totalPages && <Link href={`/finance/bank-reconciliation?page=${page + 1}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost">Next →</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
