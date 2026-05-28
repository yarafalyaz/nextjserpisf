export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteItemCategory } from "@/actions/master.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function ItemCategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const category = await prisma.itemCategory.findUnique({
    where: { id: Number(id) },
    include: {
      parent: true,
      children: true,
      items: { take: 10, orderBy: { name: "asc" } },
    },
  })

  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={category.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Item Categories", href: "/master/kategori-barang" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/kategori-barang/${id}/edit`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <DeleteButton id={category.id} action={deleteItemCategory} />
            <BackButton href="/master/kategori-barang" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Kategori" value={category.name} />
        <DetailField label="Kategori Induk" value={
          category.parent ? (
            <Link href={`/master/kategori-barang/${category.parent.id}`}>{category.parent.name}</Link>
          ) : "-"
        } />
        <DetailField label="Deskripsi" value={category.description || "-"} colSpan="full" />
        <DetailField label="Dibuat" value={formatDate(category.createdAt)} />
      </DetailCard>

      {/* Sub-categories */}
      {category.children.length > 0 && (
        <DetailSection title="Sub-Kategori">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama</DetailTableTh>
              <DetailTableTh>Deskripsi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {category.children.map((child) => (
                <DetailTableRow key={child.id}>
                  <DetailTableTd><Link href={`/master/kategori-barang/${child.id}`}>{child.name}</Link></DetailTableTd>
                  <DetailTableTd>{child.description || "-"}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </DetailSection>
      )}

      {/* Items */}
      <DetailSection title="Item">
        {category.items.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada item</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>SKU</DetailTableTh>
              <DetailTableTh>Nama</DetailTableTh>
              <DetailTableTh>Satuan</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {category.items.map((item) => (
                <DetailTableRow key={item.id}>
                  <DetailTableTd className="font-mono"><Link href={`/master/barang/${item.id}`}>{item.sku}</Link></DetailTableTd>
                  <DetailTableTd>{item.name}</DetailTableTd>
                  <DetailTableTd>{item.unitOfMeasure}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>
    </div>
  )
}
