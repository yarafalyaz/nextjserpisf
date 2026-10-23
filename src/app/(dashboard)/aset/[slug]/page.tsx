export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { DisposeAssetButton } from "./_components/dispose-asset-button"
import { deleteAsset } from "@/actions/asset.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Pencil } from "lucide-react"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { ASSET_HISTORY_TYPE_LABELS, labelFrom } from "@/lib/utils/status-labels"
import { AssetFiscalStatus, DEPRECIATION_METHOD_LABELS } from "../_components/asset-fiscal-status"
import { AssetCronDisposition, AssetUseStatus } from "../_components/asset-use-status"
import { classifyCronDisposition } from "@/lib/finance/asset-use-status"
import { ASSET_DEPRECIATION_PREFIX } from "@/lib/reports/asset-journal"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Aset" }

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_assets")
  const { slug } = await params

  const assetInclude = {
    category: true,
    group: true,
    histories: { orderBy: { date: "desc" as const }, take: 10 },
    transfers: { orderBy: { transferDate: "desc" as const }, take: 5 },
  }

  const asset = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.asset.findFirst({ where: { slug: s }, include: assetInclude }),
      byId: (id) => prisma.asset.findUnique({ where: { id }, include: assetInclude }),
    },
  )

  if (!asset) notFound()

  const depreciation = Number(asset.purchaseCost) - Number(asset.currentValue)

  // `assetBrandModelId` bare int tanpa relasi — resolve manual. Dua query
  // paralel, masing-masing nullable (merek/tipe bisa dihapus guardnya... merek
  // justru DITOLAK hapusnya bila dipakai, jadi ini murni defensif).
  const [brand, brandModel, postedDepreciation] = await Promise.all([
    asset.assetBrandId
      ? prisma.assetBrand.findUnique({ where: { id: asset.assetBrandId }, select: { name: true } })
      : null,
    asset.assetBrandModelId
      ? prisma.assetBrandModel.findUnique({ where: { id: asset.assetBrandModelId }, select: { name: true } })
      : null,
    // Nilai buku acuan kontrak F-117-V: jurnal penyusutan POSTED, bukan cache.
    prisma.journal.aggregate({
      where: {
        status: "POSTED",
        referenceType: { startsWith: ASSET_DEPRECIATION_PREFIX },
        referenceId: asset.id,
      },
      _sum: { totalDebit: true },
    }),
  ])
  const postedBookValue =
    Number(asset.purchaseCost) - Number(postedDepreciation._sum.totalDebit ?? 0)
  const cronDisposition = classifyCronDisposition({
    status: asset.status,
    idleActive: false,
    bookValue: postedBookValue,
    residualValue: asset.residualValue,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={asset.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Aset", href: "/aset" },
          { label: asset.name },
        ]}
        badge={<AssetUseStatus status={asset.status} />}
        actions={<>
          <CanCreate permission="edit_assets">
            <Button href={entityEditHref("/aset", asset)} variant="primary"><Pencil size={14} /> Ubah</Button>
          </CanCreate>
          {asset.status !== "disposed" && (
            <CanCreate permission="manage_assets">
              <DisposeAssetButton assetId={asset.id} bookValue={Number(asset.currentValue)} />
            </CanCreate>
          )}
          <CanCreate permission="delete_assets">
            <DeleteButton id={asset.id} action={deleteAsset} />
          </CanCreate>
          <BackButton href="/aset" />
        </>}
      />

      <DetailCard>
        <DetailField label="Kode Aset" value={asset.code} mono />
        <DetailField label="Kategori" value={asset.category?.name || "-"} />
        <DetailField label="Merek" value={brand?.name || "-"} />
        <DetailField label="Tipe / Model" value={brandModel?.name || "-"} />
        <DetailField label="Grup" value={asset.group?.name || "-"} />
        <DetailField label="Lokasi" value={asset.location || "-"} />
        <DetailField label="Tanggal Beli" value={formatDate(asset.purchaseDate)} />
        <DetailField label="Nilai Beli" value={formatCurrency(Number(asset.purchaseCost))} />
        <DetailField label="Nilai Saat Ini (cache)" value={formatCurrency(Number(asset.currentValue))} />
        <DetailField label="Akumulasi Penyusutan" value={<span className="text-danger">{formatCurrency(depreciation)}</span>} />
        <DetailField label="Metode Penyusutan (komersial)" value={asset.depreciationMethod ? (DEPRECIATION_METHOD_LABELS[asset.depreciationMethod] ?? asset.depreciationMethod) : "-"} />
        <DetailField label="Status Penyusutan Fiskal" value={asset.category ? <AssetFiscalStatus taxGroupCode={asset.category.taxGroupCode} taxTypeListed={asset.category.taxTypeListed} taxDjpDetermination={asset.category.taxDjpDetermination} /> : "Tanpa kategori — fiskal belum dihitung"} />
        <DetailField label="Status Guna" value={<AssetUseStatus status={asset.status} />} />
        <DetailField label="Nilai Buku (jurnal POSTED)" value={formatCurrency(postedBookValue)} />
        <DetailField label="Disposisi Penyusutan" value={<AssetCronDisposition disposition={cronDisposition} />} />
        {/* The asset form labels this field "Deskripsi" and createAsset/
            updateAsset persist it to `notes` (the `description` column is
            unused), so read it back from `notes` — otherwise the text a user
            typed was stored but never shown anywhere. */}
        <DetailField label="Deskripsi" value={asset.notes || "-"} colSpan="full" />
      </DetailCard>

      {/* History */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
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
                    <DetailTableTd><span className="inline-flex px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground">{labelFrom(ASSET_HISTORY_TYPE_LABELS, h.type)}</span></DetailTableTd>
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
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
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
