export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAssetCategory } from "@/actions/asset.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Pencil } from "lucide-react"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { AssetFiscalStatus } from "../../_components/asset-fiscal-status"
import { AssetEventMappingStatus } from "../../_components/asset-change-event"
export const metadata: Metadata = { title: "Kategori" }

export default async function AssetCategoryDetailPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ slug: string }>>
}>) {
  await requirePermission("view_asset_categories")

  const { slug } = await params

  const categoryInclude = {
    assets: {
      take: 10,
      orderBy: { createdAt: "desc" as const },
      select: { id: true, slug: true, code: true, name: true, status: true },
    },
  }

  const category = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.assetCategory.findFirst({ where: { slug: s }, include: categoryInclude }),
      byId: (id) => prisma.assetCategory.findUnique({ where: { id }, include: categoryInclude }),
    },
  )

  if (!category) notFound()

  // Status pemetaan akun peristiwa (F-128-V): id NULL = belum terpetakan dan
  // peristiwa terkait ditolak fail-closed — tampilkan apa adanya.
  const eventAccountIds = [
    category.revaluationSurplusAccountId,
    category.impairmentLossAccountId,
    category.accumulatedImpairmentAccountId,
  ].filter((id): id is number => id != null)
  const eventAccounts = eventAccountIds.length
    ? await prisma.account.findMany({ where: { id: { in: eventAccountIds } }, select: { id: true, code: true } })
    : []
  const eventAccountById = new Map(eventAccounts.map((a) => [a.id, a]))
  const eventMapping = {
    revaluationSurplus: category.revaluationSurplusAccountId != null ? (eventAccountById.get(category.revaluationSurplusAccountId) ?? null) : null,
    impairmentLoss: category.impairmentLossAccountId != null ? (eventAccountById.get(category.impairmentLossAccountId) ?? null) : null,
    accumulatedImpairment: category.accumulatedImpairmentAccountId != null ? (eventAccountById.get(category.accumulatedImpairmentAccountId) ?? null) : null,
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Kategori Aset: ${category.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Aset", href: "/aset" },
          { label: "Kategori", href: "/aset/kategori" },
          { label: category.name },
        ]}
        actions={<>
          <CanCreate permission="edit_asset_categories">
            <Button href={entityEditHref("/aset/kategori", category)} variant="primary"><Pencil size={14} /> Ubah</Button>
          </CanCreate>
          <CanCreate permission="delete_asset_categories">
            <DeleteButton id={category.id} action={deleteAssetCategory} />
          </CanCreate>
          <BackButton href="/aset/kategori" />
        </>}
      />

      <DetailCard>
        <DetailField label="Nama" value={category.name} />
        <DetailField label="Tingkat Depresiasi" value={category.depreciationRate ? `${Number(category.depreciationRate)}%` : "-"} />
        <DetailField label="Umur Manfaat (tahun)" value={category.usefulLife || "-"} />
        <DetailField label="Status Penyusutan Fiskal" value={<AssetFiscalStatus taxGroupCode={category.taxGroupCode} taxTypeListed={category.taxTypeListed} taxDjpDetermination={category.taxDjpDetermination} fiscalMethod={category.fiscalMethod} />} />
        <DetailField label="Pemetaan Akun Peristiwa" value={<AssetEventMappingStatus mapping={eventMapping} />} colSpan="full" />
        <DetailField label="Dibuat" value={formatDate(category.createdAt)} />
      </DetailCard>

      {/* Assets in this category */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Aset dalam Kategori Ini</h2>
        </div>
        <div className="p-4 px-5">
          {category.assets.length === 0 ? (
            <EmptyState title="Belum ada aset" />
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
                    <DetailTableTd className="font-mono"><Link href={entityHref("/aset", asset)}>{asset.code}</Link></DetailTableTd>
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
