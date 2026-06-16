export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { DisposeAssetButton } from "./_components/dispose-asset-button"
import { deleteAsset } from "@/actions/asset.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Pencil } from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Aset" }

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_assets")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const asset = await prisma.asset.findUnique({
    where: { id: numId },
    include: {
      category: true,
      group: true,
      histories: { orderBy: { date: "desc" }, take: 10 },
      transfers: { orderBy: { transferDate: "desc" }, take: 5 },
    },
  })

  if (!asset) notFound()

  const depreciation = Number(asset.purchaseCost) - Number(asset.currentValue)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={asset.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Aset", href: "/aset" },
          { label: asset.name },
        ]}
        badge={<StatusChip status={asset.status} />}
        actions={<>
          <Button href={`/aset/${asset.id}/ubah`} variant="primary"><Pencil size={14} /> Ubah</Button>
          {asset.status !== "disposed" && (
            <DisposeAssetButton assetId={asset.id} bookValue={Number(asset.currentValue)} />
          )}
          <DeleteButton id={asset.id} action={deleteAsset} />
          <BackButton href="/aset" />
        </>}
      />

      <DetailCard>
        <DetailField label="Kode Aset" value={asset.code} mono />
        <DetailField label="Kategori" value={asset.category?.name || "-"} />
        <DetailField label="Grup" value={asset.group?.name || "-"} />
        <DetailField label="Lokasi" value={asset.location || "-"} />
        <DetailField label="Tanggal Beli" value={formatDate(asset.purchaseDate)} />
        <DetailField label="Nilai Beli" value={formatCurrency(Number(asset.purchaseCost))} />
        <DetailField label="Nilai Saat Ini" value={formatCurrency(Number(asset.currentValue))} />
        <DetailField label="Akumulasi Penyusutan" value={<span className="text-danger">{formatCurrency(depreciation)}</span>} />
      </DetailCard>

      {/* History */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Aset</h2>
        </div>
        <div className="p-4 px-5">
          {asset.histories.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada riwayat</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Tipe</DetailTableTh>
                <DetailTableTh>Deskripsi</DetailTableTh>
                <DetailTableTh align="right">Nilai</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {asset.histories.map((h) => (
                  <DetailTableRow key={h.id}>
                    <DetailTableTd>{formatDate(h.date)}</DetailTableTd>
                    <DetailTableTd><span className="inline-flex px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground capitalize">{h.type}</span></DetailTableTd>
                    <DetailTableTd>{h.description || "-"}</DetailTableTd>
                    <DetailTableTd align="right">{h.amount ? formatCurrency(Number(h.amount)) : "-"}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      {/* Transfers */}
      {asset.transfers.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Transfer</h2>
          </div>
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Dari</DetailTableTh>
                <DetailTableTh>Ke</DetailTableTh>
                <DetailTableTh>Catatan</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {asset.transfers.map((t) => (
                  <DetailTableRow key={t.id}>
                    <DetailTableTd>{formatDate(t.transferDate)}</DetailTableTd>
                    <DetailTableTd>{t.fromLocation || "-"}</DetailTableTd>
                    <DetailTableTd>{t.toLocation}</DetailTableTd>
                    <DetailTableTd>{t.notes || "-"}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      )}
    </div>
  )
}
