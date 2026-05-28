export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteCostCenter } from "@/actions/finance.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { Pencil } from "lucide-react"

export default async function CostCenterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const costCenter = await prisma.costCenter.findUnique({
    where: { id: Number(id) },
  })

  if (!costCenter) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Cost Center: ${costCenter.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Finance", href: "/keuangan" },
          { label: "Cost Centers", href: "/keuangan/pusat-biaya" },
          { label: costCenter.name },
        ]}
        actions={<>
          <Button href={`/keuangan/pusat-biaya/${costCenter.id}/edit`} variant="primary"><Pencil size={14} /> Edit</Button>
          <DeleteButton id={costCenter.id} action={deleteCostCenter} />
          <BackButton href="/keuangan/pusat-biaya" />
        </>}
      />

      <DetailCard>
        <DetailField label="Kode" value={costCenter.code} mono />
        <DetailField label="Nama" value={costCenter.name} />
        <DetailField label="Dibuat" value={formatDate(costCenter.createdAt)} />
        <DetailField label="Diperbarui" value={formatDate(costCenter.updatedAt)} />
      </DetailCard>
    </div>
  )
}
