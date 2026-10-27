export const dynamic = "force-dynamic"

import Link from "next/link"
import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"
import { loadForwardTrace } from "@/lib/reports/genealogy-forward-trace-data"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppSearchField } from "@/components/ui/search-field"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export const metadata: Metadata = { title: "Telusur Genealogi Produksi" }

export default async function TelusurGenealogiPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_production_orders")
  const params = await searchParams
  const { query, hits } = await loadForwardTrace(params.cari ?? "")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Manufaktur", href: "/produksi" },
        { label: "Perintah Produksi", href: "/produksi/production-orders" },
        { label: "Telusur Genealogi" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Telusur Genealogi Produksi</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Masukkan lot atau nomor seri bahan yang dipakai untuk menemukan Perintah Produksi dan hasil jadi yang mengonsumsinya.
      </p>
      <AppSearchField placeholder="Cari lot / nomor seri bahan..." action="/produksi/telusur-genealogi" />

      {query && hits.length === 0 ? (
        <EmptyState title={`Tidak ada hasil jadi yang memakai lot/serial "${query}".`} />
      ) : null}

      {hits.length > 0 ? (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Perintah Produksi</DetailTableTh>
                <DetailTableTh>Hasil Jadi</DetailTableTh>
                <DetailTableTh>Bahan yang Cocok</DetailTableTh>
                <DetailTableTh>Lot/Serial Cocok</DetailTableTh>
                <DetailTableTh>Diselesaikan</DetailTableTh>
                <DetailTableTh>Diselesaikan Oleh</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {hits.map((hit) => (
                  <DetailTableRow key={hit.productionOrderId}>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/produksi/production-orders", { id: hit.productionOrderId, slug: hit.productionOrderSlug })}
                        className="font-mono hover:underline"
                      >
                        {hit.productionOrderDocumentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>
                      {hit.outputItemLabel}
                      {hit.outputSerials.length ? (
                        <span className="block font-mono text-xs text-muted-foreground">{hit.outputSerials.join(", ")}</span>
                      ) : hit.outputBatch ? (
                        <span className="block font-mono text-xs text-muted-foreground">{hit.outputBatch}</span>
                      ) : null}
                    </DetailTableTd>
                    <DetailTableTd>{hit.matchedItemLabels.join(", ")}</DetailTableTd>
                    <DetailTableTd><span className="font-mono text-xs">{hit.matchedTokens.join(", ")}</span></DetailTableTd>
                    <DetailTableTd>{formatDate(hit.completedAt)}</DetailTableTd>
                    <DetailTableTd>{hit.completedByName ?? "-"}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      ) : null}
    </div>
  )
}
