import { Eye } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { formatDate } from "@/lib/utils/format"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function BankStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  await requirePermission("view_bank_statements")

  const params = await searchParams
  const page = Number(params.page) || 1
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
  { label: "Dashboard", href: "/" },
  { label: "Finance", href: "/finance" },
  { label: "Bank Statements" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Bank Statements</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
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
                <DetailTableRow><DetailTableTd colSpan={5} className="text-center py-10 px-4 text-muted">Tidak ada data bank statement</DetailTableTd></DetailTableRow>
              ) : (
                statements.map((stmt) => (
                  <DetailTableRow key={stmt.id}>
                    <DetailTableTd className="font-mono">{stmt.id}</DetailTableTd>
                    <DetailTableTd>Account #{stmt.accountId}</DetailTableTd>
                    <DetailTableTd>{formatDate(stmt.date)}</DetailTableTd>
                    <DetailTableTd>{stmt.reference || "-"}</DetailTableTd>
                    <DetailTableTd>
                      <Link href={`/finance/bank-statements/${stmt.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost"><Eye size={16} /></Link>
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
              {page > 1 && <Link href={`/finance/bank-statements?page=${page - 1}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost">← Prev</Link>}
              {page < totalPages && <Link href={`/finance/bank-statements?page=${page + 1}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost">Next →</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
