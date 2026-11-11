"use client";

import Link from "next/link";
import { createColumnHelper } from "@/lib/table";
import { DataTable } from "@/components/ui/data-table";
import { entityHref } from "@/lib/utils/entity-url";

export interface UnitOfMeasureItem {
  id: number;
  name: string;
  symbol: string;
  category: string | null;
  isActive: boolean;
}

const columnHelper = createColumnHelper<UnitOfMeasureItem>();

const columns = [
  columnHelper.accessor("name", {
    header: "Nama Satuan",
    cell: (info) => (
      <div className="font-medium text-foreground">{info.getValue()}</div>
    ),
  }),
  columnHelper.accessor("symbol", {
    header: "Simbol",
    cell: (info) => (
      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted/60 text-foreground">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("category", {
    header: "Kategori",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">
        {info.getValue() ?? "Umum"}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    cell: (info) => (
      <div className="text-right">
        <Link
          href={entityHref("/master/satuan", info.row.original)}
          className="inline-flex items-center text-xs font-medium text-primary hover:text-primary-hover hover:underline transition-colors"
        >
          Detail
        </Link>
      </div>
    ),
  }),
];

interface UomTableProps {
  data: UnitOfMeasureItem[];
  page: number;
  pageSize: number;
  total: number;
}

export function UomTable({ data, page, pageSize, total }: UomTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Cari nama, simbol, atau kategori..."
      searchParam="cari"
      serverPagination={{
        page,
        pageSize,
        total,
      }}
      selectable={false}
    />
  );
}
