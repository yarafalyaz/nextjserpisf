export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
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
import { deleteBankStatementLine } from "@/actions/finance.actions"
import { BankStatementLineForm } from "./_components/bank-statement-line-form"
import { bankStatementLineTypeLabel } from "./_components/bank-statement-line-labels"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laporan Bank" }

/**
 * `BankStatementLine.date` disimpan sebagai TENGAH MALAM UTC hari kalender WIB
 * (aksinya memakai `wibDateToUtcMidnight`), jadi komponen UTC nilai ini memang
 * tanggal WIB-nya — nilai untuk `AppDatePicker` tanpa digeser zona waktu.
 */
function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

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
 * Pengubahan baris memakai parameter `?editBaris=<id>` (formulir inline, pola yang
 * sama dengan `/sdm/kalender-kerja` dan `/sdm/absensi`) supaya tidak perlu rute
 * `ubah` terpisah. Izin tulisnya mengikuti penulis header rekening koran
 * (`create_journals`); halaman cukup `view_bank_statements` untuk melihat.
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

  // Target ubah dibatasi pada baris rekening koran INI: id milik dokumen lain di
  // URL tidak boleh membuka formulirnya di sini (aksinya tetap menolak, tetapi
  // halaman yang menampilkan data dokumen lain itu sendiri sudah keliru).
  const editLineId = Number(query.editBaris)
  const editingLine = Number.isInteger(editLineId)
    ? stmt.lines.find((line) => line.id === editLineId)
    : undefined

  const userRoles: string[] = user.roles ?? []
  const userPerms: string[] = user.permissions ?? []
  const isSuperAdmin = userRoles.includes("super_admin")
  // Izin tulis = izin penulis header dan baris rekening koran (create_journals).
  const canWrite = isSuperAdmin || userPerms.includes("create_journals")

  const editingLineItem = editingLine
    ? {
        id: editingLine.id,
        date: dateInputValue(editingLine.date),
        description: editingLine.description ?? "",
        amount: Number(editingLine.amount),
        type: editingLine.type,
        reference: editingLine.reference ?? "",
      }
    : undefined

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
        </div>

        {canWrite ? (
          <BankStatementLineForm
            // `key` WAJIB: tanpa itu React memakai ulang formulir yang sudah ter-mount saat
            // berpindah dari "Tambah" ke "Ubah" (navigasi klien `?editBaris=N`), sehingga
            // `defaultValue` pada input tak terkendali tidak pernah diterapkan lagi — formulir
            // tampil kosong dan menyimpan akan menimpa baris yang ada dengan nilai kosong.
            key={editingLineItem ? `edit-${editingLineItem.id}` : "baru"}
            bankStatementId={stmt.id}
            baseHref={baseHref}
            line={editingLineItem}
          />
        ) : (
          <p className="p-4 px-5 text-sm text-muted-foreground">
            Anda tidak memiliki izin untuk menambah atau mengubah baris rekening koran.
          </p>
        )}

        <div className="p-4 px-5">
          {stmt.lines.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              Belum ada baris rekening koran
            </p>
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
                            // `?editBaris=` dibaca halaman ini sendiri. Izinnya eksplisit
                            // karena href-nya membawa query sehingga tidak bisa diturunkan
                            // dari prefix `ROUTE_PERMS`.
                            editHref={`${baseHref}?editBaris=${line.id}`}
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
