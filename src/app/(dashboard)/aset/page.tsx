export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AssetTable } from "./_components/asset-table"
import { AssetUseFlagSummaryCard } from "./_components/asset-use-status"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { summarizeAssetUseFlags } from "@/lib/finance/asset-use-status"
import { journalBookValue, type AssetJournalInput } from "@/lib/finance/asset-book-value"
import { ASSET_DEPRECIATION_PREFIX } from "@/lib/reports/asset-journal"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Aset" }

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_assets")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
        { location: { contains: params.cari } },
      ],
    }),
  }

  const assets = await prisma.asset.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.asset.count({ where })

  const tableData = toPlain(assets)

  // Penanda registry F-2026-10-23-117-V (Putusan 4): nilai buku jurnal POSTED
  // penuh (journalBookValue: perolehan + peristiwa − akumulasi − pelepasan −
  // kontra impairment), pola sama halaman detail; rumus lama purchaseCost −
  // Σ header penyusutan mengabaikan revaluasi/impairment/disposal sehingga
  // kartu salah menandai "tersusutkan penuh". idleActive belum punya sumber
  // peristiwa (inti BOT 3 ditunda) → false eksplisit, bukan tebakan.
  const [registryAssets, lifecycleJournals, postedChangeEvents] = await Promise.all([
    prisma.asset.findMany({
      select: {
        id: true,
        status: true,
        purchaseCost: true,
        residualValue: true,
        category: {
          select: {
            assetAccountId: true,
            accumulatedDepreciationAccountId: true,
            accumulatedImpairmentAccountId: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.journal.findMany({
      where: {
        status: "POSTED",
        deletedAt: null,
        referenceId: { not: null },
        OR: [
          { referenceType: "ASSET_ACQUISITION" },
          { referenceType: "ASSET_DISPOSAL" },
          { referenceType: { startsWith: ASSET_DEPRECIATION_PREFIX } },
        ],
      },
      select: {
        referenceId: true,
        referenceType: true,
        entries: { select: { accountId: true, debit: true, credit: true } },
      },
    }),
    prisma.assetChangeEvent.findMany({
      where: { status: "POSTED", journalId: { not: null } },
      select: { assetId: true, journalId: true },
    }),
  ])
  const eventJournalIds = [...new Set(postedChangeEvents.map((e) => e.journalId).filter((id): id is number => id != null))]
  const eventJournals = eventJournalIds.length
    ? await prisma.journal.findMany({
        where: { id: { in: eventJournalIds }, status: "POSTED", deletedAt: null },
        select: {
          id: true,
          referenceType: true,
          entries: { select: { accountId: true, debit: true, credit: true } },
        },
      })
    : []
  const assetIdByEventJournalId = new Map<number, number>()
  for (const event of postedChangeEvents) {
    if (event.journalId != null) assetIdByEventJournalId.set(event.journalId, event.assetId)
  }
  const journalsByAssetId = new Map<number, AssetJournalInput[]>()
  const pushJournal = (assetId: number | null, referenceType: string | null, entries: AssetJournalInput["lines"]) => {
    if (assetId == null) return
    const list = journalsByAssetId.get(assetId) ?? []
    list.push({ referenceType: referenceType ?? "", lines: entries })
    journalsByAssetId.set(assetId, list)
  }
  for (const journal of lifecycleJournals) pushJournal(journal.referenceId, journal.referenceType, journal.entries)
  for (const journal of eventJournals) {
    pushJournal(assetIdByEventJournalId.get(journal.id) ?? null, journal.referenceType, journal.entries)
  }
  const flagSummary = summarizeAssetUseFlags(
    registryAssets.map((asset) => {
      const posted = journalBookValue(journalsByAssetId.get(asset.id) ?? [], {
        fixedAssetAccountId: asset.category?.assetAccountId ?? null,
        accumulatedDepreciationAccountId: asset.category?.accumulatedDepreciationAccountId ?? null,
        accumulatedImpairmentAccountId: asset.category?.accumulatedImpairmentAccountId ?? null,
      })
      // Aset legacy tanpa jurnal perolehan tak punya angka jurnal — basis
      // kolom (perolehan − akumulasi kolom) seperti fallback halaman detail.
      const bookValue = posted.hasAcquisitionJournal
        ? Number(posted.bookValue)
        : Number(asset.purchaseCost) - Number(posted.accumulatedPosted)
      return {
        assetId: asset.id,
        status: asset.status,
        idleActive: false,
        bookValue,
        residualValue: asset.residualValue,
        purchaseCost: asset.purchaseCost,
      }
    }),
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Aset" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Semua Aset</h1>
        <CanCreate permission="create_assets">
          <Link
          href="/aset/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Tambah Aset
        </Link>
        </CanCreate>
      </div>

      <AssetUseFlagSummaryCard summary={toPlain(flagSummary)} />

      <AssetTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
