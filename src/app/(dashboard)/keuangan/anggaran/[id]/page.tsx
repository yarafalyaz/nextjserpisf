export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteBudget } from "@/actions/finance.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { Pencil } from "lucide-react"

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const budget = await prisma.budget.findUnique({
    where: { id: Number(id) },
  })

  if (!budget) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Anggaran: ${budget.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Anggaran", href: "/keuangan/anggaran" },
          { label: budget.name },
        ]}
        actions={<>
          <Button href={`/keuangan/anggaran/${budget.id}/ubah`} variant="primary"><Pencil size={14} /> Ubah</Button>
          <DeleteButton id={budget.id} action={deleteBudget} />
          <BackButton href="/keuangan/anggaran" />
        </>}
      />

      <DetailCard>
        <DetailField label="Nama" value={budget.name} />
        <DetailField label="Jumlah Anggaran" value={formatCurrency(Number(budget.amount))} />
        <DetailField label="Account ID" value={budget.accountId} />
        {budget.costCenterId && <DetailField label="Cost Center ID" value={budget.costCenterId} />}
        <DetailField label="Tanggal Mulai" value={formatDate(budget.startDate)} />
        <DetailField label="Tanggal Selesai" value={formatDate(budget.endDate)} />
        <DetailField label="Dibuat" value={formatDate(budget.createdAt)} />
      </DetailCard>
    </div>
  )
}
