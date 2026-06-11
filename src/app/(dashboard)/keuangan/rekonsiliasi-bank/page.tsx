export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from '@/components/ui/status-chip'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rekonsiliasi Bank" }

export default async function BankReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; status?: string }>
}) {
  await requirePermission("view_bank_reconciliation")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined
  const page = Number(params.halaman) || 1
  const perPage = 20

  const where = {
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
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
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan" },
  { label: "Rekonsiliasi Bank" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Rekonsiliasi Bank</h1>
        <Link href="/keuangan/rekonsiliasi-bank/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-recon-btn">
          + Buat Rekonsiliasi
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "completed"].map((dbStatus) => {
              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
              return (
                <Link 
                  key={dbStatus} 
                  href={`/keuangan/rekonsiliasi-bank${urlStatus ? `?status=${urlStatus}` : ""}`} 
                  className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
                >
                  {dbStatus ? statusLabel(dbStatus) : "Semua"}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Tanggal Laporan</DetailTableTh>
              <DetailTableTh>Saldo Laporan</DetailTableTh>
              <DetailTableTh>Item Tercocok</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Dibuat</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {reconciliations.length === 0 ? (
                <DetailTableRow><DetailTableTd colSpan={6} className="text-center py-10 px-4 text-muted-foreground">Tidak ada data rekonsiliasi</DetailTableTd></DetailTableRow>
              ) : (
                reconciliations.map((r) => (
                  <DetailTableRow key={r.id}>
                    <DetailTableTd>{formatDate(r.statementDate)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(r.statementBalance))}</DetailTableTd>
                    <DetailTableTd>{r.items.filter((i) => i.matched).length} / {r.items.length}</DetailTableTd>
                    <DetailTableTd><StatusChip status={r.status} /></DetailTableTd>
                    <DetailTableTd>{formatDate(r.createdAt)}</DetailTableTd>
                    <DetailTableTd>
                      <Link href={`/keuangan/rekonsiliasi-bank/${r.id}`} className="button button--ghost button--sm">Eye</Link>
                    </DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 px-5 border-t border-default">
            <span className="text-[0.8125rem] text-muted-foreground">Hal {page} dari {totalPages} ({total} data)</span>
            <div className="flex gap-1">
              {page > 1 && <Link href={`/keuangan/rekonsiliasi-bank?halaman=${page - 1}`} className="button button--ghost button--sm">← Sebelumnya</Link>}
              {page < totalPages && <Link href={`/keuangan/rekonsiliasi-bank?halaman=${page + 1}`} className="button button--ghost button--sm">Berikutnya →</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
