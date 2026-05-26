export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAssetBrand } from "@/actions/asset.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Pencil } from "lucide-react"

export default async function AssetBrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const brand = await prisma.assetBrand.findUnique({
    where: { id: Number(id) },
    include: {
      models: true,
    },
  })

  if (!brand) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Merek Aset: ${brand.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Assets", href: "/assets" },
          { label: "Brands", href: "/assets/brands" },
          { label: brand.name },
        ]}
        actions={<>
          <Button href={`/assets/brands/${brand.id}/edit`} variant="primary"><Pencil size={14} /> Edit</Button>
          <DeleteButton id={brand.id} action={deleteAssetBrand} />
          <BackButton href="/assets/brands" />
        </>}
      />

      <DetailCard>
        <DetailField label="Nama" value={brand.name} />
        <DetailField label="Dibuat" value={formatDate(brand.createdAt)} />
      </DetailCard>

      {/* Models */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Model</h2>
        </div>
        <div className="p-4 px-5">
          {brand.models.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada model</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Model</DetailTableTh>
                <DetailTableTh>Dibuat</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {brand.models.map((model) => (
                  <DetailTableRow key={model.id}>
                    <DetailTableTd>{model.name}</DetailTableTd>
                    <DetailTableTd>{formatDate(model.createdAt)}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
