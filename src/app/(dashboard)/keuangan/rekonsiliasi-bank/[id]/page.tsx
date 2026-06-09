export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rekonsiliasi Bank" }

export default async function BankReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_bank_reconciliation")
  const { id } = await params

  const recon = await prisma.bankReconciliation.findUnique({
    where: { id: Number(id) },
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
        actions={<BackButton href="/keuangan/rekonsiliasi-bank" />}
      />

      <DetailCard>
        <DetailField label="Tanggal Laporan" value={formatDate(recon.statementDate)} />
        <DetailField label="Saldo Laporan" value={formatCurrency(Number(recon.statementBalance))} />
        <DetailField label="Item Tercocok" value={`${matched} / ${recon.items.length}`} />
        <DetailField label="Status" value={<StatusChip status={recon.status} />} />
        <DetailField label="Dibuat" value={formatDate(recon.createdAt)} />
      </DetailCard>
    </div>
  )
}
