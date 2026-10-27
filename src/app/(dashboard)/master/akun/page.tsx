import { MAX_LIST_ROWS } from "@/lib/constants/list-rows";
import { Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { entityEditHref } from "@/lib/utils/entity-url"
import { EmptyState } from "@/components/ui/empty-state"
import { AppSearchField } from "@/components/ui/search-field"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { buildStatementRows, DEFAULT_STATEMENT_OPTIONS } from "@/lib/reports/statement-display"
import { accountGroupLabel } from "@/lib/utils/account-groups"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Akun" }

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_accounts")
  const canCreate = await hasPermission("create_accounts")

  const params = await searchParams

  const where = {
    isActive: true,
    ...(params.cari && {
      OR: [
        { code: { contains: params.cari } },
        { name: { contains: params.cari } },
      ],
    }),
  }

  const accounts = await prisma.account.findMany({
    where,
    orderBy: { code: "asc" },
    take: MAX_LIST_ROWS,
  })

  // Group by type
  const grouped = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = []
    acc[account.type].push(account)
    return acc
  }, {} as Record<string, typeof accounts>)

  // Opsi pohon: semua akun tampil (termasuk bersaldo nol) dan induk tidak
  // membawa saldo — daftar master bukan laporan saldo.
  const treeOptions = { ...DEFAULT_STATEMENT_OPTIONS, showZeroBalance: true, showParentBalance: false }

  const typeLabels: Record<string, string> = {
    ASSET: "Aset",
    LIABILITY: "Kewajiban",
    EQUITY: "Ekuitas",
    REVENUE: "Pendapatan",
    EXPENSE: "Beban",
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Akun (COA)" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Bagan Akun</h1>
        {canCreate && (
          <CanCreate permission="create_accounts">
          <Link href="/master/akun/tambah" className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-account-btn">
            + Tambah Akun
          </Link>
        </CanCreate>
        )}
      </div>

      <div className="p-3 px-4 flex flex-col gap-3">
        <AppSearchField placeholder="Cari kode atau nama akun..." action="/master/akun" />
      </div>

      {Object.entries(typeLabels).map(([type, label]) => {
        const group = grouped[type] ?? []
        const byId = new Map(group.map((account) => [account.id, account]))
        // Akun induk ditampilkan lebih dulu dengan anaknya ter-indentasi, seperti
        // bagan akun Accurate (bukan daftar datar).
        const rows = buildStatementRows(
          group.map((account) => ({
            id: account.id,
            code: account.code,
            name: account.name,
            parentId: account.parentId,
            ownBalance: 0,
          })),
          treeOptions,
        )

        return (
        <div key={type} className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">{label}</h2>
            <span className="text-muted-foreground text-[0.8125rem]">
              {group.length} akun
            </span>
          </div>
          <div className="p-4 px-5">
            {group.length === 0 ? (
              <EmptyState title={`Belum ada akun ${label.toLowerCase()}`} />
            ) : (
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Kode</DetailTableTh>
                  <DetailTableTh>Nama Akun</DetailTableTh>
                  <DetailTableTh>Aksi</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {rows.map((row) => {
                    const acc = byId.get(row.id)
                    if (!acc) return null
                    return (
                      <DetailTableRow key={row.id} className={row.hasChildren ? "font-semibold" : undefined}>
                        <DetailTableTd className="font-mono">{acc.code}</DetailTableTd>
                        <DetailTableTd>
                          <span style={{ paddingLeft: `${row.level * 1.25}rem` }}>{acc.name}</span>
                          {accountGroupLabel(acc.reportGroup) &&
                          accountGroupLabel(acc.reportGroup) !== acc.name ? (
                            // Label Indonesia (mis. "Kas & Bank"); kode Accurate-nya
                            // tetap tersedia lewat tooltip. Dilewati bila sama dengan
                            // nama akunnya sendiri (akun induk grup) supaya tidak mubazir.
                            <span
                              className="ml-2 rounded border border-default px-1.5 py-0.5 text-[0.6875rem] font-normal text-muted-foreground"
                              title={acc.reportGroup ?? undefined}
                            >
                              {accountGroupLabel(acc.reportGroup)}
                            </span>
                          ) : null}
                        </DetailTableTd>
                        <DetailTableTd>
                          <Link href={entityEditHref("/master/akun", acc)} className="button button--ghost button--sm"><Pencil size={14} /></Link>
                        </DetailTableTd>
                      </DetailTableRow>
                    )
                  })}
                </DetailTableBody>
              </DetailTable>
            )}
          </div>
        </div>
        )
      })}

      {accounts.length >= MAX_LIST_ROWS && (
        <p
          role="status"
          className="rounded-lg border border-default bg-warning-subtle px-4 py-2 text-xs text-warning-subtle-foreground"
        >
          Menampilkan maksimal {MAX_LIST_ROWS} baris pertama. Masih ada akun lain yang tidak
          ditampilkan — persempit pencarian atau filter untuk melihatnya.
        </p>
      )}
    </div>
  )
}
