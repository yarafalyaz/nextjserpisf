export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { EmptyState } from "@/components/ui/empty-state"
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
import { AssetAcquisitionSummary } from "../_components/asset-acquisition"
import { resolveAssetAcquisition } from "@/lib/finance/asset-acquisition"
import { AssetCronDisposition, AssetUseStatus } from "../_components/asset-use-status"
import { classifyCronDisposition } from "@/lib/finance/asset-use-status"
import { ASSET_DEPRECIATION_PREFIX } from "@/lib/reports/asset-journal"
import { isAnalyticalDepreciationMethod } from "@/lib/finance/asset-depreciation"
import { loadAssetAnalyticalStatuses } from "@/lib/reports/asset-analytical-status-data"
import { AssetAnalyticalStatus } from "../_components/asset-analytical-status"
import { AssetUsageRecordForm } from "./_components/asset-usage-record-form"
import { AssetFiscalYearFreezeForm } from "./_components/asset-fiscal-year-freeze-form"
import { fiscalMethodLabel } from "../_components/asset-fiscal-status"
import { AssetChangeEventPanel, type AssetChangeEventRow } from "./_components/asset-change-event-panel"
import { AssetEventMappingStatus } from "../_components/asset-change-event"
import { hasPermission } from "@/lib/auth/permissions"

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
    fiscalYearRows: { orderBy: { taxYear: "asc" as const } },
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

  // Snapshot perolehan F-2026-10-23-120-V: kolom jenis/dokumen/dasar fiskal
  // inti BOT 3 belum ada — fakta yang belum tercatat diteruskan apa adanya
  // (jenis/dokumen kosong), builder memutuskan; UI tidak mengarang jenis.
  const acquisition = resolveAssetAcquisition({
    acquisitionType: null,
    purchaseCost: asset.purchaseCost,
    sourceDocumentRef: null,
    isRelatedParty: null,
    marketValue: null,
    marketValueAssessor: null,
    grantIsExempt: null,
    grantorFiscalBookValue: null,
    surrenderedAssetCarryingAmount: null,
    hasLinkedTaxInvoice: null,
    linkedInputVatAmount: null,
    counterpartMapped: null,
  })

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

  const now = new Date()
  const analytical = isAnalyticalDepreciationMethod(asset.depreciationMethod)
    ? (await loadAssetAnalyticalStatuses(now.getFullYear(), now.getMonth() + 1)).rows.find((r) => r.assetId === asset.id) ?? null
    : null
  const periodLabel = `${now.getMonth() + 1}/${now.getFullYear()}`

  // Peristiwa perubahan aset terbekukan (F-111-V/F-115-V): riwayat dibaca dari
  // baris AssetChangeEvent apa adanya (snapshot akun id+kode di baris), bukan
  // join ulang mapping kategori berjalan. Nomor jurnal pasangan POSTED lewat
  // journalId baris. Kategori untuk pilihan reklasifikasi + status mapping
  // peristiwa kategori aset ini (NULL = ditolak fail-closed, tampil apa adanya).
  const [changeEvents, allCategories, canManageAssets, categoryRow] = await Promise.all([
    prisma.assetChangeEvent.findMany({
      where: { assetId: asset.id },
      orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
    }),
    prisma.assetCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    hasPermission("manage_assets"),
    asset.categoryId
      ? prisma.assetCategory.findUnique({
          where: { id: asset.categoryId },
          select: {
            revaluationSurplusAccountId: true,
            impairmentLossAccountId: true,
            accumulatedImpairmentAccountId: true,
          },
        })
      : null,
  ])
  const journalIds = changeEvents.map((ev) => ev.journalId).filter((id): id is number => id != null)
  const eventAccountIds = [
    categoryRow?.revaluationSurplusAccountId,
    categoryRow?.impairmentLossAccountId,
    categoryRow?.accumulatedImpairmentAccountId,
  ].filter((id): id is number => id != null)
  const [eventJournals, eventAccounts] = await Promise.all([
    journalIds.length
      ? prisma.journal.findMany({ where: { id: { in: journalIds } }, select: { id: true, journalNumber: true } })
      : [],
    eventAccountIds.length
      ? prisma.account.findMany({ where: { id: { in: eventAccountIds } }, select: { id: true, code: true } })
      : [],
  ])
  const journalNumberById = new Map(eventJournals.map((j) => [j.id, j.journalNumber]))
  const accountById = new Map(eventAccounts.map((a) => [a.id, a]))
  const mappingAccount = (id: number | null | undefined) => (id != null ? (accountById.get(id) ?? null) : null)
  const eventMapping = {
    revaluationSurplus: mappingAccount(categoryRow?.revaluationSurplusAccountId),
    impairmentLoss: mappingAccount(categoryRow?.impairmentLossAccountId),
    accumulatedImpairment: mappingAccount(categoryRow?.accumulatedImpairmentAccountId),
  }
  const categoryById = new Map(allCategories.map((c) => [c.id, c.name]))
  const eventRows: AssetChangeEventRow[] = changeEvents.map((ev) => ({
    id: ev.id,
    kind: ev.kind,
    status: ev.status,
    effectiveDate: ev.effectiveDate.toISOString(),
    sourceDocumentKey: ev.sourceDocumentKey,
    journalNumber: ev.journalId != null ? (journalNumberById.get(ev.journalId) ?? null) : null,
    carryingBefore: ev.carryingBefore?.toString() ?? null,
    carryingAfter: ev.carryingAfter?.toString() ?? null,
    revaluationSurplusAfter: ev.revaluationSurplusAfter?.toString() ?? null,
    fiscalBaseBefore: ev.fiscalBaseBefore?.toString() ?? null,
    fiscalBaseAfter: ev.fiscalBaseAfter?.toString() ?? null,
    finalTaxAmount: ev.finalTaxAmount?.toString() ?? null,
    finalTaxRatePercent: ev.finalTaxRatePercent?.toString() ?? null,
    surplusAccountCode: ev.surplusAccountCode,
    impairmentLossAccountCode: ev.impairmentLossAccountCode,
    accumulatedImpairmentAccountCode: ev.accumulatedImpairmentAccountCode,
    taxPayableAccountCode: ev.taxPayableAccountCode,
    fromCategoryName: ev.fromCategoryId != null ? (categoryById.get(ev.fromCategoryId) ?? `#${ev.fromCategoryId}`) : null,
    toCategoryName: ev.toCategoryId != null ? (categoryById.get(ev.toCategoryId) ?? `#${ev.toCategoryId}`) : null,
    reasonCode: ev.reasonCode,
    approvedByName: ev.approvedByName,
    appraiserName: ev.appraiserName,
    impairmentIndicator: ev.impairmentIndicator,
    recoverableBasis: ev.recoverableBasis,
    recoverableAmount: ev.recoverableAmount?.toString() ?? null,
    djpApprovalNumber: ev.djpApprovalNumber,
    oldMethod: ev.oldMethod,
    newMethod: ev.newMethod,
    newUsefulLifeMonths: ev.newUsefulLifeMonths,
    newResidualValue: ev.newResidualValue?.toString() ?? null,
    reversesEventId: ev.reversesEventId,
  }))

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
        <DetailField label="Status Penyusutan Fiskal" value={asset.category ? <AssetFiscalStatus taxGroupCode={asset.category.taxGroupCode} taxTypeListed={asset.category.taxTypeListed} taxDjpDetermination={asset.category.taxDjpDetermination} fiscalMethod={asset.category.fiscalMethod} /> : "Tanpa kategori — fiskal belum dihitung"} />
        <DetailField label="Status Guna" value={<AssetUseStatus status={asset.status} />} />
        <DetailField label="Nilai Buku (jurnal POSTED)" value={formatCurrency(postedBookValue)} />
        <DetailField label="Disposisi Penyusutan" value={<AssetCronDisposition disposition={cronDisposition} />} />
        {/* The asset form labels this field "Deskripsi" and createAsset/
            updateAsset persist it to `notes` (the `description` column is
            unused), so read it back from `notes` — otherwise the text a user
            typed was stored but never shown anywhere. */}
        <DetailField label="Deskripsi" value={asset.notes || "-"} colSpan="full" />
      </DetailCard>

      {/* Perolehan — snapshot builder F-2026-10-23-120-V apa adanya */}
      <section
        aria-label="Perolehan aset"
        className="rounded-xl border border-default bg-surface p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-4">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Perolehan
          </h2>
          <AssetAcquisitionSummary result={acquisition} />
        </div>
      </section>

      {analytical && (
        <DetailCard title="Penyusutan Analitis (tanpa jurnal)">
          <DetailField label={`Status Analitis ${periodLabel}`} value={<AssetAnalyticalStatus row={analytical} periodLabel={periodLabel} />} colSpan="full" />
          {asset.depreciationMethod === "units_of_production" && (
            <DetailField label="Dokumen Unit Aktual" value={<CanCreate permission="edit_assets"><AssetUsageRecordForm assetId={asset.id} defaultYear={now.getFullYear()} defaultMonth={now.getMonth() + 1} /></CanCreate>} colSpan="full" />
          )}
        </DetailCard>
      )}

      {/* Saldo fiskal tahunan terbekukan (F-109-V): snapshot server apa adanya */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Saldo Fiskal Tahunan</h2>
          <CanCreate permission="edit_assets">
            <AssetFiscalYearFreezeForm assetId={asset.id} defaultThroughYear={now.getFullYear()} />
          </CanCreate>
        </div>
        <div className="p-4 px-5">
          {asset.fiscalYearRows.length === 0 ? (
            <EmptyState title="Belum ada baris tahun fiskal terbekukan" description="Angka fiskal tahun berjalan di laporan berlabel estimasi-tahun-berjalan sampai baris tahun dibuat." />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tahun Pajak</DetailTableTh>
                <DetailTableTh>Metode</DetailTableTh>
                <DetailTableTh>Sumber</DetailTableTh>
                <DetailTableTh align="right">Saldo Awal</DetailTableTh>
                <DetailTableTh align="right">Penyusutan</DetailTableTh>
                <DetailTableTh align="right">Saldo Akhir</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {asset.fiscalYearRows.map((row) => (
                  <DetailTableRow key={row.id}>
                    <DetailTableTd>{row.taxYear}</DetailTableTd>
                    <DetailTableTd>{fiscalMethodLabel(row.method)}</DetailTableTd>
                    <DetailTableTd>{row.source}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(row.openingBalance))}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(row.depreciation))}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(row.closingBalance))}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      {/* Peristiwa perubahan aset (F-111-V/F-115-V) */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Peristiwa Perubahan Aset</h2>
        </div>
        <div className="flex flex-col gap-4 p-4 px-5">
          {asset.category ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">
                Pemetaan Akun Peristiwa — Kategori {asset.category.name}
              </p>
              <AssetEventMappingStatus mapping={eventMapping} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aset tanpa kategori — pemetaan akun peristiwa belum tersedia; peristiwa berharga ditolak server.
            </p>
          )}
          <AssetChangeEventPanel
            assetId={asset.id}
            events={eventRows}
            categories={allCategories}
            currentCategoryId={asset.categoryId ?? null}
            canManage={canManageAssets}
          />
        </div>
      </div>

      {/* History */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Aset</h2>
        </div>
        <div className="p-4 px-5">
          {asset.histories.length === 0 ? (
            <EmptyState title="Belum ada riwayat" />
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
