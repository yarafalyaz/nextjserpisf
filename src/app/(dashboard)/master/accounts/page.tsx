import { Eye, Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  await requirePermission("view_accounts")

  const params = await searchParams

  const where = {
    isActive: true,
    ...(params.search && {
      OR: [
        { code: { contains: params.search } },
        { name: { contains: params.search } },
      ],
    }),
  }

  const accounts = await prisma.account.findMany({
    where,
    orderBy: { code: "asc" },
  })

  // Group by type
  const grouped = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = []
    acc[account.type].push(account)
    return acc
  }, {} as Record<string, typeof accounts>)

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
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Accounts" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Chart of Accounts</h1>
        <Link href="/master/accounts/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-account-btn">
          + Tambah Akun
        </Link>
      </div>

      <div className="p-3 px-4 flex flex-col gap-3">
        <AppSearchField placeholder="Cari kode atau nama akun..." action="/master/accounts" />
      </div>

      {Object.entries(typeLabels).map(([type, label]) => (
        <div key={type} className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">{label}</h2>
            <span className="text-muted text-[0.8125rem]">
              {grouped[type]?.length || 0} akun
            </span>
          </div>
          <div className="p-4 px-5">
            {!grouped[type] || grouped[type].length === 0 ? (
              <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada akun {label.toLowerCase()}</p>
            ) : (
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Kode</DetailTableTh>
                  <DetailTableTh>Nama Akun</DetailTableTh>
                  <DetailTableTh>Aksi</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {grouped[type].map((acc) => (
                    <DetailTableRow key={acc.id}>
                      <DetailTableTd className="font-mono">{acc.code}</DetailTableTd>
                      <DetailTableTd>{acc.name}</DetailTableTd>
                      <DetailTableTd>
                        <Link href={`/master/accounts/${acc.id}/edit`} className="button button--ghost button--sm"><Pencil size={14} /></Link>
                      </DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
