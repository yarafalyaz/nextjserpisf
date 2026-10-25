"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import {
  EMPLOYEE_LOAN_CHANNEL_LABELS,
  isEmployeeLoanStatus,
  type EmployeeLoanChannel,
} from "@/lib/reports/employee-loan-channel"

export interface MyLoanRequestRow {
  id: number
  loanDate: string
  totalAmount: number
  monthlyInstallment: number
  remainingAmount: number
  status: string
  channel: EmployeeLoanChannel | null
}

const columnHelper = createColumnHelper<MyLoanRequestRow>()

const columns = [
  columnHelper.accessor("loanDate", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("totalAmount", {
    header: "Jumlah",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  columnHelper.accessor("monthlyInstallment", {
    header: "Angsuran/Bulan",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  columnHelper.accessor("remainingAmount", {
    header: "Sisa",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    // Kosakata tertutup Q-LS-4: status sah tampil via StatusChip; status di
    // luar kosakata tampil apa adanya, jangan dipetakan paksa.
    cell: (info) =>
      isEmployeeLoanStatus(info.getValue()) ? (
        <StatusChip status={info.getValue()} />
      ) : (
        <span>{info.getValue()}</span>
      ),
  }),
  columnHelper.accessor("channel", {
    header: "Kanal",
    // Label kanal verbatim builder Backend (Q-LS-3b) — turunan baca server.
    cell: (info) =>
      info.getValue() ? EMPLOYEE_LOAN_CHANNEL_LABELS[info.getValue()!] : "—",
  }),
]

/** Daftar pengajuan pinjaman milik karyawan login (baca-saja, tanpa aksi ubah/hapus). */
export function MyLoanRequestsTable({ data }: { data: MyLoanRequestRow[] }) {
  return <DataTable data={data} columns={columns} ariaLabel="Daftar pengajuan pinjaman saya" />
}
