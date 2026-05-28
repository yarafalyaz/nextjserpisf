export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePettyCash } from "@/actions/finance.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { Pencil } from "lucide-react"

export default async function PettyCashDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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
          { label: "Dashboard", href: "/" },
          { label: "Finance", href: "/keuangan" },
          { label: "Petty Cash", href: "/keuangan/kas-kecil" },
          { label: pettyCash.documentNo },
        ]}
        actions={<>
          <Button href={`/keuangan/kas-kecil/${pettyCash.id}/edit`} variant="primary"><Pencil size={14} /> Edit</Button>
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
