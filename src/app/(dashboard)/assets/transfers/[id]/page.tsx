export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAssetTransfer } from "@/actions/asset.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Assets", href: "/assets" },
  { label: "Transfers", href: "/assets/transfers" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Transfer Aset</h1>
<div className="flex gap-2">
          <Link href={`/assets/transfers/${transfer.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={transfer.id} action={deleteAssetTransfer} />
                  <Link href="/assets/transfers" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Aset</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/assets/${transfer.asset.id}`}>{transfer.asset.code} - {transfer.asset.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dari Lokasi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{transfer.fromLocation || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Ke Lokasi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{transfer.toLocation}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Transfer</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(transfer.transferDate)}</span>
          </div>
          {transfer.notes && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{transfer.notes}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(transfer.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
