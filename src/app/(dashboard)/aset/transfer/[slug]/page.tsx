export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAssetTransfer } from "@/actions/asset.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { Pencil } from "lucide-react"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Transfer Stok" }

export default async function AssetTransferDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_asset_transfers")

  const { slug } = await params

  const transferInclude = {
    asset: { select: { id: true, slug: true, code: true, name: true } },
  }

  const transfer = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.assetTransfer.findFirst({ where: { slug: s }, include: transferInclude }),
      byId: (id) => prisma.assetTransfer.findUnique({ where: { id }, include: transferInclude }),
    },
  )

  if (!transfer) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transfer Aset"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Aset", href: "/aset" },
          { label: "Transfer", href: "/aset/transfer" },
          { label: "Detail" },
        ]}
        actions={<>
          <CanCreate permission="edit_asset_transfers">
            <Button href={entityEditHref("/aset/transfer", transfer)} variant="primary"><Pencil size={14} /> Ubah</Button>
          </CanCreate>
          <CanCreate permission="delete_asset_transfers">
            <DeleteButton id={transfer.id} action={deleteAssetTransfer} />
          </CanCreate>
          <BackButton href="/aset/transfer" />
        </>}
      />

      <DetailCard>
        <DetailField label="Aset" value={<Link href={entityHref("/aset", transfer.asset)}>{transfer.asset.code} - {transfer.asset.name}</Link>} />
        <DetailField label="Dari Lokasi" value={transfer.fromLocation || "-"} />
        <DetailField label="Ke Lokasi" value={transfer.toLocation} />
        <DetailField label="Tanggal Transfer" value={formatDate(transfer.transferDate)} />
        {transfer.notes && <DetailField label="Catatan" value={transfer.notes} colSpan="full" />}
        <DetailField label="Dibuat" value={formatDate(transfer.createdAt)} />
      </DetailCard>
    </div>
  )
}
