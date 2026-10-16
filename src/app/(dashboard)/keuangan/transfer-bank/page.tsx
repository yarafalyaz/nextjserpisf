export const dynamic = "force-dynamic"

import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { BankTransferTable } from "./_components/bank-transfer-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Transfer Bank" }

export default async function BankTransfersPage() {
  await requirePermission("view_bank_transfers")

  const transfers = await prisma.bankTransfer.findMany({
    where: { deletedAt: null },
    orderBy: { date: "desc" },
    take: 200,
  })

  const accountIds = [
    ...new Set(
      transfers.flatMap((transfer) => [
        transfer.fromAccountId,
        transfer.toAccountId,
        ...(transfer.feeAccountId ? [transfer.feeAccountId] : []),
      ]),
    ),
  ]
  const accounts = accountIds.length
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true },
      })
    : []
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const label = (id: number) => {
    const account = accountById.get(id)
    return account ? `${account.code} ${account.name}` : `#${id}`
  }

  const rows = transfers.map((transfer) => ({
    id: transfer.id,
    documentNo: transfer.documentNo,
    date: transfer.date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
    from: label(transfer.fromAccountId),
    to: label(transfer.toAccountId),
    amount: Number(transfer.amount),
    adminFee: Number(transfer.adminFee),
    journalId: transfer.journalId,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Transfer Bank" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transfer Bank</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pemindahan dana antar rekening kas/bank. Setiap transfer otomatis membuat satu jurnal
            yang langsung diposting.
          </p>
        </div>
        <CanCreate permission="create_bank_transfers">
          <Link
            href="/keuangan/transfer-bank/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-all"
            id="create-bank-transfer-btn"
          >
            + Tambah Transfer
          </Link>
        </CanCreate>
      </div>

      <BankTransferTable data={rows} />
    </div>
  )
}
