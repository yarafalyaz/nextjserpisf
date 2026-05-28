export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAssetCategory } from "@/actions/asset.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Pencil } from "lucide-react"

export default async function AssetCategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const category = await prisma.assetCategory.findUnique({
    where: { id: Number(id) },
    include: {
      assets: { take: 10, orderBy: { createdAt: "desc" } },
    },
  })

  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Kategori Aset: ${category.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Assets", href: "/aset" },
          { label: "Categories", href: "/aset/kategori" },
          { label: category.name },
        ]}
        actions={<>
          <Button href={`/aset/kategori/${category.id}/ubah`} variant="primary"><Pencil size={14} /> Edit</Button>
          <DeleteButton id={category.id} action={deleteAssetCategory} />
          <BackButton href="/aset/kategori" />
        </>}
      />

      <DetailCard>
        <DetailField label="Nama" value={category.name} />
        <DetailField label="Tingkat Depresiasi" value={category.depreciationRate ? `${Number(category.depreciationRate)}%` : "-"} />
        <DetailField label="Umur Manfaat (tahun)" value={category.usefulLife || "-"} />
        <DetailField label="Dibuat" value={formatDate(category.createdAt)} />
      </DetailCard>

      {/* Assets in this category */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Aset dalam Kategori Ini</h2>
        </div>
        <div className="p-4 px-5">
          {category.assets.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada aset</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Kode</DetailTableTh>
                <DetailTableTh>Nama</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {category.assets.map((asset) => (
                  <DetailTableRow key={asset.id}>
                    <DetailTableTd className="font-mono"><Link href={`/aset/${asset.id}`}>{asset.code}</Link></DetailTableTd>
                    <DetailTableTd>{asset.name}</DetailTableTd>
                    <DetailTableTd><StatusChip status={asset.status} /></DetailTableTd>
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
