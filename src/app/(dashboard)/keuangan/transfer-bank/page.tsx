import { Plus } from "@/components/ui/fontawesome-icons";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Transfer Kas & Bank</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pemindahan dana antar rekening kas/bank perusahaan. Transaksi otomatis membukukan jurnal debit-kredit.
          </p>
        </div>
        <CanCreate permission="create_bank_transfers">
          <Link
            href="/keuangan/transfer-bank/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-bank-transfer-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Transfer</span>
          </Link>
        </CanCreate>
      </div>

      <BankTransferTable data={rows} />
    </div>
  )
}
