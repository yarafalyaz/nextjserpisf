"use client";

import Link from "next/link";
import { createColumnHelper } from "@/lib/table";
import { DataTable } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { entityEditHref } from "@/lib/utils/entity-url";

export interface WithholdingTaxTypeItem {
  id: number;
  code: string;
  name: string;
  rate: number;
  isActive: boolean;
}

const columnHelper = createColumnHelper<WithholdingTaxTypeItem>();

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => (
      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted/60 text-foreground">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama Pajak",
    cell: (info) => (
      <span className="font-medium text-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("rate", {
    header: "Tarif",
    cell: (info) => (
      <div className="text-right font-mono tabular-nums text-sm font-medium text-foreground">
        {Number(info.getValue()).toLocaleString("id-ID")}%
      </div>
    ),
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (
      <StatusChip status={info.getValue() ? "active" : "inactive"} />
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    cell: (info) => (
      <div className="text-right">
        <Link
          href={entityEditHref("/pengaturan/pajak-potong", info.row.original)}
          className="inline-flex items-center text-xs font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
        >
          Ubah
        </Link>
      </div>
    ),
  }),
];

interface WithholdingTaxTableProps {
  data: WithholdingTaxTypeItem[];
}

export function WithholdingTaxTable({ data }: WithholdingTaxTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Cari kode atau nama pajak potong..."
      searchColumn="name"
      selectable={false}
    />
  );
}
