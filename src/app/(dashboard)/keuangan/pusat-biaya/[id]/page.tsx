export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteCostCenter } from "@/actions/finance.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { Pencil } from "lucide-react"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Pusat Biaya" }

export default async function CostCenterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_cost_centers")

  const { id } = await params

  const costCenter = await prisma.costCenter.findUnique({
    where: { id: Number(id) },
  })

  if (!costCenter) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pusat Biaya: ${costCenter.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Pusat Biaya", href: "/keuangan/pusat-biaya" },
          { label: costCenter.name },
        ]}
        actions={<>
          <Button href={`/keuangan/pusat-biaya/${costCenter.id}/ubah`} variant="primary"><Pencil size={14} /> Ubah</Button>
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
