export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ChequeManager, type ChequeRow } from "./_components/cheque-manager"
import { ChequeOverdueQueueSection } from "./_components/cheque-overdue-queue"
import { getChequeOverdueQueue } from "@/lib/reports/cheque-overdue-queue-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Giro & Cek" }

export default async function ChequesPage() {
  await requirePermission("view_cheques")

  const [cheques, accounts] = await Promise.all([
    prisma.cheque.findMany({
      where: { deletedAt: null },
      orderBy: { dueDate: "asc" },
      take: 200,
    }),
    prisma.account.findMany({
      where: { isActive: true, reportGroup: "BANK" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ])

  // Seksi turunan baca-saja (F-2026-10-27-104-S, Q-CQ-3): gerbang
  // view_cheques ditegakkan ulang fail-closed di loader sebelum query.
  const overdueQueue = await getChequeOverdueQueue()

  const accountById = new Map(accounts.map((account) => [account.id, account]))

  const rows: ChequeRow[] = cheques.map((cheque) => {
    const account = cheque.accountId ? accountById.get(cheque.accountId) : undefined
    return {
      id: cheque.id,
      documentNo: cheque.documentNo,
      type: cheque.type,
      direction: cheque.direction,
      number: cheque.number,
      party: cheque.party,
      accountLabel: account ? `${account.code} ${account.name}` : null,
      amount: Number(cheque.amount),
      dueDate: cheque.dueDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      status: cheque.status,
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Giro & Cek" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Giro &amp; Cek</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register giro dan cek beserta jatuh temponya. Yang masih berstatus “Belum Cair” dan jatuh
            tempo ke depan tampil di laporan Giro Mundur.
          </p>
        </div>
      </div>

      <ChequeOverdueQueueSection queue={overdueQueue} />

      <ChequeManager cheques={rows} accounts={accounts} />
    </div>
  )
}
