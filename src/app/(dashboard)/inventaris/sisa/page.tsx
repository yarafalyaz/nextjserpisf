export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { RemnantForm, ConsumeRemnantForm, ScrapRemnantForm } from "./_components/remnant-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Sisa Material" }

/**
 * Sisa potong usable / scrap (P1-5). Remnant BUKAN stok gudang ganda — ia
 * mencatat sisa dari material yang sudah keluar. Usable dapat dipakai untuk
 * kebutuhan berikut (consume); scrap wajib alasan + tercatat terpisah.
 */
export default async function RemnantPage() {
  await requirePermission("view_material_issues")

  const remnants = await prisma.remnant.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { item: { select: { sku: true, name: true } } },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sisa Material"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Sisa Material" },
        ]}
      />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Catat Sisa</h2>
            <p className="text-xs text-muted-foreground">
              Sisa potong dari issue/produksi: dimensi, sumber, biaya bawaan.
            </p>
          </div>
        </div>
        <RemnantForm />
        <div className="p-4 px-5">
          {remnants.length === 0 ? (
            <EmptyState title="Belum ada sisa tercatat" className="py-10" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Dokumen</DetailTableTh>
                <DetailTableTh>Item</DetailTableTh>
                <DetailTableTh>Qty</DetailTableTh>
                <DetailTableTh>Dimensi</DetailTableTh>
                <DetailTableTh>Ukuran Terukur</DetailTableTh>
                <DetailTableTh>Sumber Baris Issue</DetailTableTh>
                <DetailTableTh>Besi Tua (kg)</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh align="right">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {remnants.map((r) => (
                  <DetailTableRow key={r.id}>
                    <DetailTableTd>{r.documentNo}</DetailTableTd>
                    <DetailTableTd>{r.item.sku} — {r.item.name}</DetailTableTd>
                    <DetailTableTd>{String(r.qty)} {r.uom ?? ""}</DetailTableTd>
                    <DetailTableTd>{r.dimensions ?? "—"}</DetailTableTd>
                    <DetailTableTd>{r.measuredSize != null ? String(r.measuredSize) : "—"}</DetailTableTd>
                    <DetailTableTd>
                      {r.sourceType
                        ? `${r.sourceType === "material_issue_item" ? "Baris Material Issue" : r.sourceType === "production_order_material" ? "Baris Material Perintah Produksi" : r.sourceType}${r.sourceId != null ? ` #${r.sourceId}` : ""}`
                        : "—"}
                    </DetailTableTd>
                    <DetailTableTd>{r.scrapWeightKg != null ? String(r.scrapWeightKg) : "—"}</DetailTableTd>
                    <DetailTableTd>{r.status}</DetailTableTd>
                    <DetailTableTd align="right">
                      {r.status === "usable" && (
                        <div className="flex justify-end gap-2">
                          <ConsumeRemnantForm id={r.id} />
                          <ScrapRemnantForm id={r.id} />
                        </div>
                      )}
                    </DetailTableTd>
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
