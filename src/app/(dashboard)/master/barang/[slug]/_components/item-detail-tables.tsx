"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper, type ErpColumnDef } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate, formatReferenceType } from "@/lib/utils/format"

export interface ItemUomConversionRow {
  id: number
  code: string
  factorToBase: number
}

const uomColumnHelper = createColumnHelper<ItemUomConversionRow>()

export function ItemUomConversionsTable({
  data,
  unitOfMeasure,
}: {
  data: ItemUomConversionRow[]
  unitOfMeasure: string
}) {
  const columns = useMemo(
    () => [
      uomColumnHelper.accessor("code", {
        header: "Kode Satuan",
        meta: { mobilePrimary: true },
      }),
      uomColumnHelper.accessor("factorToBase", {
        header: `Faktor ke Satuan Dasar (${unitOfMeasure})`,
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
        ),
      }),
    ],
    [unitOfMeasure],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Satuan alternatif barang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface ItemBatchRow {
  id: number
  batchNumber: string
  qty: number
  expiryDate: string | null
}

const batchColumnHelper = createColumnHelper<ItemBatchRow>()

export function ItemBatchesTable({
  data,
  unitOfMeasure,
}: {
  data: ItemBatchRow[]
  unitOfMeasure: string
}) {
  const columns = useMemo(
    () => [
      batchColumnHelper.accessor("batchNumber", {
        header: "No. Batch/Lot",
        meta: { mobilePrimary: true },
      }),
      batchColumnHelper.accessor("qty", {
        header: "Jml",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">
            {info.getValue()} {unitOfMeasure}
          </div>
        ),
      }),
      batchColumnHelper.accessor("expiryDate", {
        header: "Kedaluwarsa",
        cell: (info) => (info.getValue() ? formatDate(info.getValue()!) : "-"),
      }),
    ],
    [unitOfMeasure],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar batch atau lot barang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface ItemSerialRow {
  id: number
  serialNumber: string
  status: string
}

const serialColumnHelper = createColumnHelper<ItemSerialRow>()

const serialColumns = [
  serialColumnHelper.accessor("serialNumber", {
    header: "Nomor Seri",
    meta: { mobilePrimary: true },
  }),
  serialColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function ItemSerialsTable({ data }: { data: ItemSerialRow[] }) {
  return (
    <DataTable
      data={data}
      columns={serialColumns}
      ariaLabel="Daftar nomor seri barang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface ItemInventoryLayerRow {
  id: number
  createdAt: string
  qtyIn: number
  qtyOut: number
  remaining: number
  unitCost: number
}

const layerColumnHelper = createColumnHelper<ItemInventoryLayerRow>()

export function ItemInventoryLayersTable({
  data,
  canViewCosts,
}: {
  data: ItemInventoryLayerRow[]
  canViewCosts: boolean
}) {
  const columns = useMemo(() => {
    const cols: ErpColumnDef<ItemInventoryLayerRow, any>[] = [
      layerColumnHelper.accessor("createdAt", {
        header: "Masuk",
        meta: { mobilePrimary: true },
        cell: (info) => formatDate(info.getValue()),
      }),
      layerColumnHelper.accessor("qtyIn", {
        header: "Kuantitas Masuk",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
        ),
      }),
      layerColumnHelper.accessor("qtyOut", {
        header: "Kuantitas Keluar",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
        ),
      }),
      layerColumnHelper.accessor("remaining", {
        header: "Sisa",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums font-bold">{info.getValue()}</div>
        ),
      }),
    ]
    if (canViewCosts) {
      cols.push(
        layerColumnHelper.accessor("unitCost", {
          header: "Biaya Satuan",
          meta: { align: "right" },
          cell: (info) => (
            <div className="text-right font-mono tabular-nums">
              {formatCurrencyExact(info.getValue())}
            </div>
          ),
        }),
      )
    }
    return cols
  }, [canViewCosts])

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Lapisan FIFO barang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface ItemTransactionRow {
  id: number
  createdAt: string
  documentNo: string
  docLink: string | null
  referenceType: string | null
  moveType: string | null
  impact: string
  qty: number
  cost: number
  partyLabel: string | null
  party: string
  warehouseName: string | null
}

const txColumnHelper = createColumnHelper<ItemTransactionRow>()

export function ItemTransactionsTable({
  data,
  canViewCosts,
}: {
  data: ItemTransactionRow[]
  canViewCosts: boolean
}) {
  const columns = useMemo(() => {
    const cols: ErpColumnDef<ItemTransactionRow, any>[] = [
      txColumnHelper.accessor("createdAt", {
        header: "Tanggal",
        cell: (info) => formatDate(info.getValue()),
      }),
      txColumnHelper.accessor("documentNo", {
        header: "No. Dokumen",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const sm = info.row.original
          return sm.docLink ? (
            <Link href={sm.docLink} className="font-mono text-primary hover:underline">
              {sm.documentNo}
            </Link>
          ) : (
            <span className="font-mono">{sm.documentNo}</span>
          )
        },
      }),
      txColumnHelper.display({
        id: "type",
        header: "Tipe",
        cell: (info) => {
          const sm = info.row.original
          return (
            <span className="text-xs text-muted-foreground">
              {formatReferenceType(sm.referenceType || sm.moveType)}
            </span>
          )
        },
      }),
      txColumnHelper.accessor("impact", {
        header: "Masuk/Keluar",
        cell: (info) => <StatusChip status={info.getValue() === "IN" ? "received" : "returned"} />,
      }),
      txColumnHelper.accessor("qty", {
        header: "Jml",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
        ),
      }),
    ]
    if (canViewCosts) {
      cols.push(
        txColumnHelper.accessor("cost", {
          header: "Harga Satuan",
          meta: { align: "right" },
          cell: (info) => (
            <div className="text-right font-mono tabular-nums">
              {formatCurrencyExact(info.getValue())}
            </div>
          ),
        }),
      )
    }
    cols.push(
      txColumnHelper.accessor("party", {
        header: "Pihak",
        cell: (info) => {
          const sm = info.row.original
          return (
            <span>
              {sm.partyLabel && (
                <span className="text-xs text-muted-foreground">{sm.partyLabel}: </span>
              )}
              <span className="text-sm">{sm.party}</span>
            </span>
          )
        },
      }),
      txColumnHelper.accessor("warehouseName", {
        header: "Gudang",
        cell: (info) => info.getValue() || "-",
      }),
    )
    return cols
  }, [canViewCosts])

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Riwayat transaksi barang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
