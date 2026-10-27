import { Eye, Plus } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { formatDate } from "@/lib/utils/format"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { entityHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laporan Bank" }

export default async function BankStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string }>
}) {
  await requirePermission("view_bank_statements")

  const params = await searchParams
  const page = Number(params.halaman) || 1
  const perPage = 20

  const [statements, total] = await Promise.all([
    prisma.bankStatement.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.bankStatement.count(),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan" },
  { label: "Rekening Koran" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Laporan Bank</h1>
        <CanCreate permission="create_journals">
          <Link href="/keuangan/laporan-bank/tambah" className="button button--primary w-full sm:w-auto">
            <Plus size={16} /> Tambah Rekening Koran
          </Link>
        </CanCreate>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>ID</DetailTableTh>
              <DetailTableTh>Akun Bank</DetailTableTh>
              <DetailTableTh>Tanggal</DetailTableTh>
              <DetailTableTh>Referensi</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {statements.length === 0 ? (
                <DetailTableRow><DetailTableTd colSpan={5}><EmptyState title="Tidak ada data rekening koran" className="py-10" /></DetailTableTd></DetailTableRow>
              ) : (
                statements.map((stmt) => (
                  <DetailTableRow key={stmt.id}>
                    <DetailTableTd className="font-mono">{stmt.id}</DetailTableTd>
                    <DetailTableTd>No. Rekening {stmt.accountNumber ? stmt.accountNumber : stmt.accountId}</DetailTableTd>
                    <DetailTableTd>{formatDate(stmt.date)}</DetailTableTd>
                    <DetailTableTd>{stmt.reference || "-"}</DetailTableTd>
                    <DetailTableTd>
                      <Link href={entityHref("/keuangan/laporan-bank", stmt)} className="button button--ghost button--sm"><Eye size={16} /></Link>
                    </DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-5 border-t border-default">
            <span className="text-[0.8125rem] text-muted-foreground">Hal {page} dari {totalPages} ({total} data)</span>
            <div className="flex gap-1">
              {page > 1 && <Link href={`/keuangan/laporan-bank?halaman=${page - 1}`} className="button button--ghost button--sm">← Sebelumnya</Link>}
              {page < totalPages && <Link href={`/keuangan/laporan-bank?halaman=${page + 1}`} className="button button--ghost button--sm">Berikutnya →</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
