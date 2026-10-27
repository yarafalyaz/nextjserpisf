export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { PageHeader, BackButton } from "@/components/ui/page-header"
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

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laporan Bank" }

/**
 * Detail rekening koran: ringkasan saldo + baris mutasinya.
 *
 * Sampai halaman ini dilengkapi, `BankStatementLine` tidak punya jalur tulis
 * maupun tampilan: rekening koran bisa dibuat, tetapi barisnya tak pernah bisa
 * diisi (hanya skrip seed) dan halaman detailnya tak pernah merender baris apa
 * pun — sehingga `totalDebits`/`totalCredits` header selalu 0. Ringkasan di bawah
 * menampilkan kolom header APA ADANYA: nilainya dihitung ulang oleh aksi baris
 * (nilai absolut dari agregat barisnya) — jangan menghitung ulang di sini, karena
 * dua sumber angka untuk hal yang sama adalah cara keduanya menyimpang.
 *
 * Penambahan & pengubahan baris memakai halaman terpisah
 * (`/baris/tambah` dan `/baris/[lineId]/ubah` di bawah detail ini);
 * tautan lama `?editBaris=<id>` diarahkan ke halaman ubah. Izin tulisnya
 * mengikuti penulis header rekening koran (`create_journals`); halaman
 * cukup `view_bank_statements` untuk melihat.
 */
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

  // Tautan lama `?editBaris=<id>` diarahkan ke halaman ubah baris.
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
  // Izin tulis = izin penulis header dan baris rekening koran (create_journals).
  const canWrite = isSuperAdmin || userPerms.includes("create_journals")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Laporan Bank #${stmt.id}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Laporan Bank", href: "/keuangan/laporan-bank" },
          { label: "Detail" },
        ]}
        actions={<BackButton href="/keuangan/laporan-bank" />}
      />

      <DetailCard>
        <DetailField label="Akun Bank" value={account ? `${account.code} - ${account.name}` : `No. Rekening ${stmt.accountId}`} />
        <DetailField label="Tanggal" value={formatDate(stmt.date)} />
        <DetailField label="Referensi" value={stmt.reference || "-"} />
        <DetailField label="Dibuat" value={formatDate(stmt.createdAt)} />
        {stmt.accountNumber && <DetailField label="Nomor Rekening" value={stmt.accountNumber} mono />}
        {stmt.notes && <DetailField label="Catatan" value={stmt.notes} colSpan="full" />}
      </DetailCard>

      {/* Ringkasan: saldo awal, total debit/kredit (dihitung aksi baris), saldo akhir. */}
      <DetailCard title="Ringkasan Mutasi" columns={4}>
        <DetailField label="Saldo Awal" value={formatCurrency(Number(stmt.openingBalance))} />
        <DetailField label="Total Debit" value={formatCurrency(Number(stmt.totalDebits))} />
        <DetailField label="Total Kredit" value={formatCurrency(Number(stmt.totalCredits))} />
        <DetailField label="Saldo Akhir" value={formatCurrency(Number(stmt.closingBalance))} />
      </DetailCard>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Baris Rekening Koran</h2>
            <p className="text-xs text-muted-foreground">
              {stmt.lines.length} baris. Nominal selalu positif; arah mutasi (debit/kredit) yang
              menentukan kolomnya.
            </p>
          </div>
          {canWrite && (
            <Link
              href={`${baseHref}/baris/tambah`}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            >
              + Tambah Baris
            </Link>
          )}
        </div>

        {!canWrite && (
          <p className="p-4 px-5 text-sm text-muted-foreground border-b border-default">
            Anda tidak memiliki izin untuk menambah atau mengubah baris rekening koran.
          </p>
        )}

        <div className="p-4 px-5">
          {stmt.lines.length === 0 ? (
            <EmptyState title="Belum ada baris rekening koran" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Deskripsi</DetailTableTh>
                <DetailTableTh>Referensi</DetailTableTh>
                <DetailTableTh>Arah</DetailTableTh>
                <DetailTableTh align="right">Debit</DetailTableTh>
                <DetailTableTh align="right">Kredit</DetailTableTh>
                {canWrite && <DetailTableTh align="right">Aksi</DetailTableTh>}
              </DetailTableHead>
              <DetailTableBody>
                {stmt.lines.map((line) => (
                  <DetailTableRow key={line.id}>
                    <DetailTableTd>{formatDate(line.date)}</DetailTableTd>
                    <DetailTableTd>{line.description || "-"}</DetailTableTd>
                    <DetailTableTd>{line.reference || "-"}</DetailTableTd>
                    <DetailTableTd>{bankStatementLineTypeLabel(line.type)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(line.debit))}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(line.credit))}</DetailTableTd>
                    {canWrite && (
                      <DetailTableTd align="right">
                        <div className="flex items-center justify-end">
                          <ActionDropdown
                            editHref={`${baseHref}/baris/${line.id}/ubah`}
                            editPermission="create_journals"
                            deleteAction={deleteBankStatementLine}
                            deleteId={line.id}
                            deletePermission="create_journals"
                          />
                        </div>
                      </DetailTableTd>
                    )}
                  </DetailTableRow>
                ))}
              </DetailTableBody>
              <DetailTableFoot>
                <DetailTableFootRow>
                  <DetailTableTd colSpan={4}>
                    <strong>Total</strong>
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    <strong>{formatCurrency(Number(stmt.totalDebits))}</strong>
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    <strong>{formatCurrency(Number(stmt.totalCredits))}</strong>
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
