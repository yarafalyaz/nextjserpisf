"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { FitmentBadge } from "@/components/reports/fitment-badge"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact, formatNumber } from "@/lib/utils/format"

export interface WorkOrderPoRow {
  id: number
  slug: string | null
  documentNo: string
  isService: boolean
  grandTotal: number
  status: string
}

export interface WorkOrderProdOrderRow {
  id: number
  slug: string | null
  documentNo: string
  qty: number
  status: string
}

export interface WorkOrderMaterialIssueRow {
  id: number
  slug: string | null
  documentNo: string
  status: string
}

export interface WorkOrderItemRow {
  id: number
  itemName: string
  fitmentResult: string | null
  fitmentRuleId: number | null
  description: string | null
  status: string
  qty: number
  cost: number
}

const poColumnHelper = createColumnHelper<WorkOrderPoRow>()

const poColumns = [
  poColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/pembelian/pesanan", row)}
          className="font-mono font-medium text-primary hover:underline"
        >
          {row.documentNo}
        </Link>
      )
    },
  }),
  poColumnHelper.accessor("isService", {
    header: "Jenis",
    cell: (info) => (
      <span className="text-foreground">{info.getValue() ? "Jasa" : "Barang"}</span>
    ),
  }),
  poColumnHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  poColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function WorkOrderPurchaseOrdersTable({ data }: { data: WorkOrderPoRow[] }) {
  return (
    <DataTable
      data={data}
      columns={poColumns}
      ariaLabel="Pesanan Pembelian Terkait"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const prodOrderColumnHelper = createColumnHelper<WorkOrderProdOrderRow>()

const prodOrderColumns = [
  prodOrderColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/produksi/production-orders", row)}
          className="font-mono font-medium text-primary hover:underline"
        >
          {row.documentNo}
        </Link>
      )
    },
  }),
  prodOrderColumnHelper.accessor("qty", {
    header: "Kuantitas",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  prodOrderColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function WorkOrderProductionOrdersTable({ data }: { data: WorkOrderProdOrderRow[] }) {
  return (
    <DataTable
      data={data}
      columns={prodOrderColumns}
      ariaLabel="Perintah Produksi Terkait"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const miColumnHelper = createColumnHelper<WorkOrderMaterialIssueRow>()

const miColumns = [
  miColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/inventaris/pengeluaran-material", row)}
          className="font-mono font-medium text-primary hover:underline"
        >
          {row.documentNo}
        </Link>
      )
    },
  }),
  miColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function WorkOrderMaterialIssuesTable({ data }: { data: WorkOrderMaterialIssueRow[] }) {
  return (
    <DataTable
      data={data}
      columns={miColumns}
      ariaLabel="Pengeluaran Material Terkait"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const itemColumnHelper = createColumnHelper<WorkOrderItemRow>()

export function WorkOrderItemsTable({
  data,
  canViewCosts,
  totalCost,
}: {
  data: WorkOrderItemRow[]
  canViewCosts: boolean
  totalCost: number
}) {
  const columns = useMemo(
    () => [
      itemColumnHelper.accessor("itemName", {
        header: "Nama Barang",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const item = info.row.original
          return (
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{item.itemName}</span>
              <FitmentBadge
                fitmentResult={item.fitmentResult}
                fitmentRuleId={item.fitmentRuleId}
              />
            </div>
          )
        },
      }),
      itemColumnHelper.accessor("description", {
        header: "Deskripsi",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue() || "-"}</span>
        ),
      }),
      itemColumnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusChip status={info.getValue() || "pending"} />,
      }),
      itemColumnHelper.accessor("qty", {
        header: "Jml",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums text-foreground">
            {formatNumber(info.getValue())}
          </span>
        ),
      }),
      ...(canViewCosts
        ? [
            itemColumnHelper.accessor("cost", {
              header: "Biaya/Unit",
              meta: { align: "right" },
              cell: (info) => (
                <span className="font-mono tabular-nums text-foreground">
                  {formatCurrencyExact(info.getValue())}
                </span>
              ),
            }),
            itemColumnHelper.display({
              id: "lineTotal",
              header: "Total",
              meta: { align: "right" },
              cell: (info) => {
                const item = info.row.original
                return (
                  <span className="font-mono tabular-nums text-foreground">
                    {formatCurrencyExact(item.qty * item.cost)}
                  </span>
                )
              },
            }),
          ]
        : []),
    ],
    [canViewCosts],
  )

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        data={data}
        columns={columns}
        ariaLabel="Daftar Bahan Perintah Kerja"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
      {canViewCosts && (
        <div className="flex flex-wrap items-center justify-end gap-6 rounded-lg border border-default bg-surface-muted/40 px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-bold font-mono tabular-nums text-foreground">
              {formatCurrencyExact(totalCost)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
