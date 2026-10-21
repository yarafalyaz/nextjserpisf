export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate, formatReferenceType, referenceHref } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"
import Link from "next/link"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref } from "@/lib/utils/entity-url"
import { resolveReferenceSlugs, referenceSlugKey } from "@/lib/services/reference-slug.service"

export const metadata: Metadata = { title: "Mutasi Stok" }

export default async function StockMoveDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_stock_moves")
  const { slug } = await params

  const move = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.stockMove.findFirst({
          where: { slug: s },
          include: { item: true, warehouse: true },
        }),
      byId: (id) =>
        prisma.stockMove.findUnique({
          where: { id },
          include: { item: true, warehouse: true },
        }),
    },
  )
  if (!move) notFound()

  const referenceSlugs = await resolveReferenceSlugs([move])
  const moveRefSlug = referenceSlugs.get(referenceSlugKey(move))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pergerakan Stok ${move.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Pergerakan Stok", href: "/inventaris/mutasi-stok" },
          { label: "Detail" },
        ]}
        actions={<BackButton href="/inventaris/mutasi-stok" />}
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={move.documentNo} mono />
        <DetailField label="Barang" value={<Link href={move.item ? entityHref("/master/barang", move.item) : `/master/barang/${move.itemId}`} className="hover:underline">{move.item?.name || `Barang #${move.itemId}`}</Link>} />
        <DetailField label="Gudang" value={move.warehouse?.name || "-"} />
        <DetailField label="Arah" value={<StatusChip status={move.impact === "IN" ? "received" : "returned"} />} />
        <DetailField label="Jumlah" value={`${Number(move.qty)} ${move.item?.unitOfMeasure ?? ""}`} />
        <DetailField label="Harga Satuan" value={formatCurrency(Number(move.cost))} />
        <DetailField
          label="Tipe"
          value={
            referenceHref(move.referenceType, move.referenceId, moveRefSlug) ? (
              <Link href={referenceHref(move.referenceType, move.referenceId, moveRefSlug)!} className="text-primary hover:underline">
                {formatReferenceType(move.referenceType || move.moveType)}
              </Link>
            ) : (
              formatReferenceType(move.referenceType || move.moveType)
            )
          }
        />
        <DetailField label="Tanggal" value={formatDate(move.date ?? move.createdAt)} />
      </DetailCard>
    </div>
  )
}
