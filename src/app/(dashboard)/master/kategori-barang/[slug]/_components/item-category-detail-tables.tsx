"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"

export interface ItemCategoryChildRow {
  id: number
  slug: string | null
  name: string
  description: string | null
}

const childColumnHelper = createColumnHelper<ItemCategoryChildRow>()

const childColumns = [
  childColumnHelper.accessor("name", {
    header: "Nama",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/master/kategori-barang", info.row.original)} className="hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  childColumnHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => info.getValue() || "-",
  }),
]

export function ItemCategoryChildrenTable({ data }: { data: ItemCategoryChildRow[] }) {
  return (
    <DataTable
      data={data}
      columns={childColumns}
      ariaLabel="Daftar sub-kategori"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface ItemCategoryItemRow {
  id: number
  slug: string | null
  sku: string
  name: string
  unitOfMeasure: string
}

const itemColumnHelper = createColumnHelper<ItemCategoryItemRow>()

const itemColumns = [
  itemColumnHelper.accessor("sku", {
    header: "SKU",
    cell: (info) => (
      <Link href={entityHref("/master/barang", info.row.original)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  itemColumnHelper.accessor("name", {
    header: "Nama",
    meta: { mobilePrimary: true },
  }),
  itemColumnHelper.accessor("unitOfMeasure", {
    header: "Satuan",
  }),
]

export function ItemCategoryItemsTable({ data }: { data: ItemCategoryItemRow[] }) {
  return (
    <DataTable
      data={data}
      columns={itemColumns}
      ariaLabel="Daftar barang dalam kategori"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface ItemCategoryBrandRow {
  id: number
  slug: string | null
  name: string
  itemsCount: number
}

const brandColumnHelper = createColumnHelper<ItemCategoryBrandRow>()

const brandColumns = [
  brandColumnHelper.accessor("name", {
    header: "Nama Merek",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/master/merek", info.row.original)} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  brandColumnHelper.accessor("itemsCount", {
    header: "Jumlah Barang",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
    ),
  }),
]

export function ItemCategoryBrandsTable({ data }: { data: ItemCategoryBrandRow[] }) {
  return (
    <DataTable
      data={data}
      columns={brandColumns}
      ariaLabel="Daftar merek dalam kategori"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
