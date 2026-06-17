export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { CompleteReconciliationButton } from "../_components/complete-reconciliation-button"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rekonsiliasi Bank" }

export default async function BankReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_bank_reconciliation")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const recon = await prisma.bankReconciliation.findUnique({
    where: { id: numId },
    include: { items: true },
  })
  if (!recon) notFound()

  const matched = recon.items.filter((i) => i.matched).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Rekonsiliasi Bank #${recon.id}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={recon.status} />}
        actions={<>
          {recon.status === "draft" && <CompleteReconciliationButton reconciliationId={recon.id} />}
          <BackButton href="/keuangan/rekonsiliasi-bank" />
        </>}
      />

      <DetailCard>
        <DetailField label="Tanggal Laporan" value={formatDate(recon.statementDate)} />
        <DetailField label="Saldo Buku" value={formatCurrency(Number(recon.bookBalance))} />
        <DetailField label="Saldo Laporan" value={formatCurrency(Number(recon.statementBalance))} />
        <DetailField label="Setoran Beredar" value={formatCurrency(Number(recon.outstandingDeposits))} />
        <DetailField label="Cek Beredar" value={formatCurrency(Number(recon.outstandingPayments))} />
        <DetailField label="Saldo Buku Disesuaikan" value={formatCurrency(Number(recon.adjustedBookBalance))} />
        <DetailField label="Selisih" value={
          <span className={Math.abs(Number(recon.difference)) < 0.01 ? "text-success font-semibold" : "text-danger font-semibold"}>
            {formatCurrency(Number(recon.difference))}
          </span>
        } />
        <DetailField label="Item Tercocok" value={`${matched} / ${recon.items.length}`} />
        <DetailField label="Status" value={<StatusChip status={recon.status} />} />
        <DetailField label="Dibuat" value={formatDate(recon.createdAt)} />
      </DetailCard>
    </div>
  )
}
