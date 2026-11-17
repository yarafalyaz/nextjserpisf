export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "@/components/ui/fontawesome-icons"
import { EmptyState } from "@/components/ui/empty-state"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteItemCategory } from "@/actions/master.actions"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import {
  ItemCategoryBrandsTable,
  ItemCategoryChildrenTable,
  ItemCategoryItemsTable,
} from "./_components/item-category-detail-tables"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
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
            <CanCreate permission="edit_item_categories">
              <Button href={entityEditHref("/master/kategori-barang", category)} variant="secondary"><Pencil aria-hidden="true" size={14} /> Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_item_categories">
              <DeleteButton id={category.id} action={deleteItemCategory} />
            </CanCreate>
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
          <ItemCategoryChildrenTable
            data={category.children.map((child) => ({
              id: child.id,
              slug: child.slug,
              name: child.name,
              description: child.description,
            }))}
          />
        </DetailSection>
      )}

      {/* Items */}
      <DetailSection title="Barang">
        {category.items.length === 0 ? (
          <EmptyState title="Belum ada barang" />
        ) : (
          <ItemCategoryItemsTable
            data={category.items.map((item) => ({
              id: item.id,
              slug: item.slug,
              sku: item.sku,
              name: item.name,
              unitOfMeasure: item.unitOfMeasure,
            }))}
          />
        )}
      </DetailSection>
      {/* Brands */}
      <DetailSection title={`Merek (${category.brands.length})`}>
        {category.brands.length === 0 ? (
          <EmptyState title="Belum ada merek untuk kategori ini" />
        ) : (
          <ItemCategoryBrandsTable
            data={category.brands.map((brand) => ({
              id: brand.id,
              slug: brand.slug,
              name: brand.name,
              itemsCount: brand._count.items,
            }))}
          />
        )}
      </DetailSection>
    </div>
  )
}
