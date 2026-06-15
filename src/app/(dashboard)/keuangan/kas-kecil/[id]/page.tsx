export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePettyCash } from "@/actions/finance.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { Pencil } from "lucide-react"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Kas Kecil" }

export default async function PettyCashDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_petty_cash")

  const { id } = await params

  const pettyCash = await prisma.pettyCash.findUnique({
    where: { id: Number(id) },
  })

  if (!pettyCash) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Kas Kecil ${pettyCash.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Kas Kecil", href: "/keuangan/kas-kecil" },
          { label: pettyCash.documentNo },
        ]}
        actions={<>
          <Button href={`/keuangan/kas-kecil/${pettyCash.id}/ubah`} variant="primary"><Pencil size={14} /> Ubah</Button>
          <DeleteButton id={pettyCash.id} action={deletePettyCash} />
          <BackButton href="/keuangan/kas-kecil" />
        </>}
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={pettyCash.documentNo} mono />
        <DetailField label="Tipe" value={pettyCash.type} />
        <DetailField label="Jumlah" value={formatCurrency(Number(pettyCash.amount))} />
        <DetailField label="Saldo Sebelum" value={formatCurrency(Number(pettyCash.balanceBefore))} />
        <DetailField label="Saldo Setelah" value={formatCurrency(Number(pettyCash.balanceAfter))} />
        <DetailField label="Tanggal" value={formatDate(pettyCash.date)} />
        {pettyCash.accountId && <DetailField label="Account ID" value={pettyCash.accountId} />}
        {pettyCash.description && <DetailField label="Deskripsi" value={pettyCash.description} colSpan="full" />}
        <DetailField label="Dibuat" value={formatDate(pettyCash.createdAt)} />
      </DetailCard>

      <TransactionAttachments referenceType="petty_cash" referenceId={pettyCash.id} />
    </div>
  )
}
