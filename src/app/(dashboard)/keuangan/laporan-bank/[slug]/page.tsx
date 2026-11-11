export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { PageHeader } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { deleteBankStatementLine } from "@/actions/finance.actions"
import { bankStatementLineTypeLabel } from "./_components/bank-statement-line-labels"
import {
  Plus,
  Upload,
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
} from "@/components/ui/fontawesome-icons"
import { StatusChip } from "@/components/ui/status-chip"
import { statusLabel } from "@/lib/utils/status-labels"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Rekening Koran" }

export default async function BankStatementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ editBaris?: string }>
}) {
  const user = await requirePermission("view_bank_statements")
  const { slug } = await params
  const query = await searchParams

  if (query.editBaris) {
    const legacyLineId = Number(query.editBaris)
    if (Number.isInteger(legacyLineId) && legacyLineId > 0) {
      redirect(`/keuangan/laporan-bank/${encodeURIComponent(slug)}/baris/${legacyLineId}/ubah`)
    }
  }

  const lineInclude = {
    lines: { orderBy: [{ date: "asc" as const }, { id: "asc" as const }] },
  }

  const stmt = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.bankStatement.findFirst({ where: { slug: s, ...where }, include: lineInclude }),
      byId: (id, where) =>
        prisma.bankStatement.findFirst({ where: { id, ...where }, include: lineInclude }),
    },
  )
  if (!stmt) notFound()

  const account = stmt.accountId
    ? await prisma.account.findUnique({ where: { id: stmt.accountId }, select: { code: true, name: true } })
    : null

  const baseHref = `/keuangan/laporan-bank/${encodeURIComponent(slug)}`

  const userRoles: string[] = user.roles ?? []
  const userPerms: string[] = user.permissions ?? []
  const isSuperAdmin = userRoles.includes("super_admin")
  const canWrite = isSuperAdmin || userPerms.includes("create_journals")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Rekening Koran #${stmt.id}`}
        subtitle="Rincian informasi rekening koran, saldo awal-akhir, dan daftar baris mutasi debit/kredit."
        badge={
          <div className="flex items-center gap-2">
            <StatusChip
              status={stmt.status}
              customLabel={statusLabel(stmt.status)}
              customTone={stmt.status === "draft" ? "warning" : "success"}
            />
          </div>
        }
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Rekening Koran", href: "/keuangan/laporan-bank" },
          { label: `#${stmt.id}` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {canWrite && (
              <>
                <Link
                  href={`${baseHref}/impor`}
                  className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
                >
                  <Upload className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Import CSV</span>
                </Link>
                <Link
                  href={`${baseHref}/baris/tambah`}
                  className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-2xs transition-colors"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  <span>Tambah Baris</span>
                </Link>
              </>
            )}
          </div>
        }
      />

      {/* Financial Metric Strip: Saldo Awal, Total Debit, Total Kredit, Saldo Akhir */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4">
        {/* Saldo Awal */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Saldo Awal Dokumen</p>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatCurrencyExact(Number(stmt.openingBalance))}
          </p>
        </div>

        {/* Total Debit (Dana Masuk ke Bank) */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Total Penerimaan (Debit)</p>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {formatCurrencyExact(Number(stmt.totalDebits))}
          </p>
        </div>

        {/* Total Kredit (Dana Keluar dari Bank) */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Total Pengeluaran (Kredit)</p>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-red-600 dark:text-red-400 font-mono tabular-nums">
            {formatCurrencyExact(Number(stmt.totalCredits))}
          </p>
        </div>

        {/* Saldo Akhir */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Saldo Akhir Dokumen</p>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatCurrencyExact(Number(stmt.closingBalance))}
          </p>
        </div>
      </div>

      {/* Detail Informasi Dokumen Rekening Koran */}
      <DetailCard title="Informasi Rekening Koran" columns={3}>
        <DetailField
          label="Akun Bank Terkait"
          value={
            account ? (
              <span className="font-medium text-sm text-foreground flex items-center gap-1.5">
                <Landmark className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>{account.code} - {account.name}</span>
              </span>
            ) : (
              `Akun #${stmt.accountId}`
            )
          }
        />
        <DetailField label="Tanggal Dokumen" value={formatDate(stmt.date)} />
        <DetailField label="Nomor Referensi" value={stmt.reference || "-"} mono />
        {stmt.accountNumber && (
          <DetailField label="Nomor Rekening Bank" value={stmt.accountNumber} mono />
        )}
        <DetailField
          label="Rentang Periode Mutasi"
          value={
            stmt.periodStart || stmt.periodEnd ? (
              <span className="font-mono text-xs tabular-nums">
                {stmt.periodStart ? formatDate(stmt.periodStart) : "-"} s/d{" "}
                {stmt.periodEnd ? formatDate(stmt.periodEnd) : "-"}
              </span>
            ) : (
              "-"
            )
          }
        />
        <DetailField label="Waktu Dicatat" value={formatDate(stmt.createdAt)} />
        {stmt.notes && <DetailField label="Catatan" value={stmt.notes} colSpan="full" />}
      </DetailCard>

      {/* Tabel Baris Mutasi Rekening Koran */}
      <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-border bg-muted/20">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Daftar Baris Mutasi Rekening Koran</h2>
            <p className="text-xs text-muted-foreground">
              {stmt.lines.length} baris mutasi tercatat. Nominal mutasi debit/kredit selalu bernilai positif.
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            Total {stmt.lines.length} baris
          </span>
        </div>

        {!canWrite && (
          <p className="p-3.5 px-5 text-xs text-muted-foreground bg-muted/30 border-b border-border">
            Mode baca-saja: Anda tidak memiliki izin untuk menambah atau mengubah baris mutasi rekening koran.
          </p>
        )}

        <div className="overflow-x-auto">
          {stmt.lines.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Belum ada baris transaksi rekening koran"
                description="Gunakan tombol Tambah Baris atau Import CSV di atas untuk memasukkan data transaksi rekening koran."
                className="py-10"
              />
            </div>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Keterangan / Uraian</DetailTableTh>
                <DetailTableTh>No. Referensi</DetailTableTh>
                <DetailTableTh align="center">Arah Mutasi</DetailTableTh>
                <DetailTableTh align="right">Debit (Masuk)</DetailTableTh>
                <DetailTableTh align="right">Kredit (Keluar)</DetailTableTh>
                {canWrite && <DetailTableTh align="right">Aksi</DetailTableTh>}
              </DetailTableHead>
              <DetailTableBody>
                {stmt.lines.map((line) => (
                  <DetailTableRow key={line.id} className="hover:bg-muted/40 transition-colors">
                    <DetailTableTd>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDate(line.date)}
                      </span>
                    </DetailTableTd>
                    <DetailTableTd>
                      <span className="text-xs font-medium text-foreground">{line.description || "-"}</span>
                    </DetailTableTd>
                    <DetailTableTd>
                      <span className="font-mono text-xs text-muted-foreground">{line.reference || "-"}</span>
                    </DetailTableTd>
                    <DetailTableTd align="center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          line.type === "DEBIT" || line.type === "debit"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                        }`}
                      >
                        {bankStatementLineTypeLabel(line.type)}
                      </span>
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      <span className="font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {Number(line.debit) > 0 ? formatCurrencyExact(Number(line.debit)) : "-"}
                      </span>
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      <span className="font-mono text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {Number(line.credit) > 0 ? formatCurrencyExact(Number(line.credit)) : "-"}
                      </span>
                    </DetailTableTd>
                    {canWrite && (
                      <DetailTableTd align="right">
                        <div className="flex items-center justify-end">
                          <ActionDropdown
                            editHref={`${baseHref}/baris/${line.id}/ubah`}
                            editPermission="create_journals"
                            deleteAction={deleteBankStatementLine}
                            deleteId={line.id}
                            deletePermission="create_journals"
                            deleteConfirmTitle="Hapus baris mutasi rekening koran ini?"
                            deleteConfirmBody="Baris mutasi akan dihapus dan total debit/kredit header akan dihitung ulang secara otomatis."
                          />
                        </div>
                      </DetailTableTd>
                    )}
                  </DetailTableRow>
                ))}
              </DetailTableBody>
              <DetailTableFoot>
                <DetailTableFootRow className="bg-muted/30">
                  <DetailTableTd colSpan={4}>
                    <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                      Total Mutasi Tercatat
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatCurrencyExact(Number(stmt.totalDebits))}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                      {formatCurrencyExact(Number(stmt.totalCredits))}
                    </span>
                  </DetailTableTd>
                  {canWrite && <DetailTableTd>{null}</DetailTableTd>}
                </DetailTableFootRow>
              </DetailTableFoot>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
