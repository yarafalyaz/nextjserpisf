"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteDownPayment } from "@/actions/sales.actions"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

import {
  DownPaymentTaxStatusBadge,
  type DownPaymentVatSnapshotView,
} from "./down-payment-vat-snapshot"

interface DownPayment {
  id: number
  slug: string | null
  documentNo: string
  quotation: { documentNo: string; slug?: string | null; customer: { name: string } }
  amount: number | string
  paymentDate?: Date | string | null
  paymentMethod?: string | null
  status: string
  createdAt: Date | string
  /** Snapshot PPN verbatim server (read-model PR #785); null = belum ada baris read-model. */
  vatSnapshot?: DownPaymentVatSnapshotView | null
}

const columnHelper = createColumnHelper<DownPayment>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <div className="flex flex-col gap-0.5">
        <Link href={entityHref("/penjualan/uang-muka", info.row.original)} className="text-foreground hover:underline font-mono font-medium">
          {info.getValue()}
        </Link>
        <span className="text-2xs text-muted-foreground font-mono">
          Ref: {info.row.original.quotation.documentNo}
        </span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.quotation.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    cell: (info) => (
      <span className="font-medium text-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor((row) => row.paymentDate ?? row.createdAt, {
    id: "paymentDate",
    header: "Tgl. Bayar",
    cell: (info) => (
      <div className="flex flex-col gap-0.5">
        <span>{formatDate(info.getValue())}</span>
        {info.row.original.paymentMethod ? (
          <span className="text-2xs text-muted-foreground uppercase">
            {info.row.original.paymentMethod}
          </span>
        ) : null}
      </div>
    ),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah Uang Muka",
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground font-medium">
        {formatCurrencyExact(Number(info.getValue()))}
      </span>
    ),
  }),
  columnHelper.accessor((row) => row.vatSnapshot ?? null, {
    id: "vatSnapshot",
    header: "Snapshot PPN",
    cell: (info) => {
      const snap = info.getValue()
      if (!snap) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <span className="flex flex-col items-start gap-1">
          <span className="text-xs font-mono tabular-nums">
            {snap.vatAmount === null ? "PPN —" : `PPN ${formatCurrencyExact(snap.vatAmount)}`} · {snap.pkpSnapshotLabel}
          </span>
          <DownPaymentTaxStatusBadge snapshot={snap} />
        </span>
      )
    },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      return <StatusChip status={info.getValue()} />
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        deleteAction={deleteDownPayment}
        deleteId={info.row.original.id}
        editPermission="edit_down_payments"
        deletePermission="delete_down_payments"
      />
    ),
  }),
]

interface DownPaymentTableProps {
  data: DownPayment[]
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function DownPaymentTable({ data, total, page, pageSize, toolbar, filters }: DownPaymentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar uang muka"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
    />
  )
}
