export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAssetTransfer } from "@/actions/asset.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { Pencil } from "lucide-react"

export default async function AssetTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const transfer = await prisma.assetTransfer.findUnique({
    where: { id: Number(id) },
    include: {
      asset: true,
    },
  })

  if (!transfer) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transfer Aset"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Assets", href: "/aset" },
          { label: "Transfers", href: "/aset/transfer" },
          { label: "Detail" },
        ]}
        actions={<>
          <Button href={`/aset/transfer/${transfer.id}/ubah`} variant="primary"><Pencil size={14} /> Edit</Button>
          <DeleteButton id={transfer.id} action={deleteAssetTransfer} />
          <BackButton href="/aset/transfer" />
        </>}
      />

      <DetailCard>
        <DetailField label="Aset" value={<Link href={`/aset/${transfer.asset.id}`}>{transfer.asset.code} - {transfer.asset.name}</Link>} />
        <DetailField label="Dari Lokasi" value={transfer.fromLocation || "-"} />
        <DetailField label="Ke Lokasi" value={transfer.toLocation} />
        <DetailField label="Tanggal Transfer" value={formatDate(transfer.transferDate)} />
        {transfer.notes && <DetailField label="Catatan" value={transfer.notes} colSpan="full" />}
        <DetailField label="Dibuat" value={formatDate(transfer.createdAt)} />
      </DetailCard>
    </div>
  )
}
