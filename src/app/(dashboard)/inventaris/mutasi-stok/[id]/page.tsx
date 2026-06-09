export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mutasi Stok" }

export default async function StockMoveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_stock_moves")
  const { id } = await params

  const move = await prisma.stockMove.findUnique({
    where: { id: Number(id) },
    include: { item: true, warehouse: true },
  })
  if (!move) notFound()

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
        <DetailField label="Barang" value={move.item?.name || "-"} />
        <DetailField label="Gudang" value={move.warehouse?.name || "-"} />
        <DetailField label="Arah" value={<StatusChip status={move.impact === "IN" ? "received" : "returned"} />} />
        <DetailField label="Jumlah" value={`${Number(move.qty)} ${move.item?.unitOfMeasure ?? ""}`} />
        <DetailField label="Harga Satuan" value={formatCurrency(Number(move.cost))} />
        <DetailField label="Tipe" value={move.referenceType || move.moveType || "-"} />
        <DetailField label="Tanggal" value={formatDate(move.date ?? move.createdAt)} />
      </DetailCard>
    </div>
  )
}
