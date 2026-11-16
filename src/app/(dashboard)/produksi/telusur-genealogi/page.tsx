export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"
import { loadForwardTrace } from "@/lib/reports/genealogy-forward-trace-data"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppSearchField } from "@/components/ui/search-field"
import { EmptyState } from "@/components/ui/empty-state"
import { GenealogyTraceTable } from "./_components/genealogy-trace-table"

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
            <GenealogyTraceTable
              data={hits.map((hit) => ({
                id: hit.productionOrderId,
                productionOrderId: hit.productionOrderId,
                productionOrderSlug: hit.productionOrderSlug,
                productionOrderDocumentNo: hit.productionOrderDocumentNo,
                outputItemLabel: hit.outputItemLabel,
                outputSerials: hit.outputSerials,
                outputBatch: hit.outputBatch,
                matchedItemLabels: hit.matchedItemLabels,
                matchedTokens: hit.matchedTokens,
                completedAt: hit.completedAt.toISOString(),
                completedByName: hit.completedByName,
              }))}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
