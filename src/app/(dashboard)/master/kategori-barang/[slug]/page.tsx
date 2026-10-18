export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteItemCategory } from "@/actions/master.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Kategori Barang" }

export default async function ItemCategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_item_categories")

  const { slug } = await params

  const category = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.itemCategory.findFirst({
          where: { slug: s },
          include: {
            parent: true,
            children: true,
            items: { take: 10, orderBy: { name: "asc" } },
            brands: { orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, _count: { select: { items: true } } } },
          },
        }),
      byId: (id) =>
        prisma.itemCategory.findUnique({
          where: { id },
          include: {
            parent: true,
            children: true,
            items: { take: 10, orderBy: { name: "asc" } },
            brands: { orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, _count: { select: { items: true } } } },
          },
        }),
    },
  )

  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={category.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Kategori Barang", href: "/master/kategori-barang" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={entityEditHref("/master/kategori-barang", category)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            <DeleteButton id={category.id} action={deleteItemCategory} />
            <BackButton href="/master/kategori-barang" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Kategori" value={category.name} />
        <DetailField label="Kategori Induk" value={
          category.parent ? (
            <Link href={entityHref("/master/kategori-barang", category.parent)}>{category.parent.name}</Link>
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
                  <DetailTableTd><Link href={entityHref("/master/kategori-barang", child)}>{child.name}</Link></DetailTableTd>
                  <DetailTableTd>{child.description || "-"}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </DetailSection>
      )}

      {/* Items */}
      <DetailSection title="Barang">
        {category.items.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada barang</p>
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
                  <DetailTableTd className="font-mono"><Link href={entityHref("/master/barang", item)}>{item.sku}</Link></DetailTableTd>
                  <DetailTableTd>{item.name}</DetailTableTd>
                  <DetailTableTd>{item.unitOfMeasure}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>
      {/* Brands */}
      <DetailSection title={`Merek (${category.brands.length})`}>
        {category.brands.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada merek untuk kategori ini</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama Merek</DetailTableTh>
              <DetailTableTh>Jumlah Barang</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {category.brands.map((brand) => (
                <DetailTableRow key={brand.id}>
                  <DetailTableTd>
                    <Link href={entityHref("/master/merek", brand)} className="text-primary hover:underline font-medium">
                      {brand.name}
                    </Link>
                  </DetailTableTd>
                  <DetailTableTd>{brand._count.items}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>
    </div>
  )
}
