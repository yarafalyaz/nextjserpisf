import { Info } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Satuan" }

export default async function UomPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_units")

  const params = await searchParams
  const { page, pageSize, skip, take } = parsePagination(params)

  const items = await prisma.item.findMany({
    where: { deletedAt: null },
    select: { unitOfMeasure: true },
    distinct: ["unitOfMeasure"],
    orderBy: { unitOfMeasure: "asc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const uomList = items.map((i) => i.unitOfMeasure)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Satuan" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Satuan (Unit of Measure)</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4 text-secondary">
          <Info size={16} />
          <span>Satuan dikelola sebagai field teks pada data barang. Berikut daftar satuan yang digunakan saat ini:</span>
        </div>

        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>ID</DetailTableTh>
            <DetailTableTh>Kode</DetailTableTh>
            <DetailTableTh>Nama</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {uomList.length === 0 ? (
              <DetailTableRow>
                <DetailTableTd colSpan={3} className="text-center py-10 px-4 text-muted-foreground">Belum ada satuan yang digunakan</DetailTableTd>
              </DetailTableRow>
            ) : (
              uomList.map((uom, idx) => (
                <DetailTableRow key={uom}>
                  <DetailTableTd>{idx + 1}</DetailTableTd>
                  <DetailTableTd className="font-mono">{uom}</DetailTableTd>
                  <DetailTableTd className="font-medium">{uom}</DetailTableTd>
                </DetailTableRow>
              ))
            )}
          </DetailTableBody>
        </DetailTable>
      </div>
    </div>
  )
}
