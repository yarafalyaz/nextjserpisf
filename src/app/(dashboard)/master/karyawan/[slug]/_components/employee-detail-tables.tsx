"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { LEAVE_TYPE_LABELS, labelFrom } from "@/lib/utils/status-labels"

export interface EmployeeLoanRow {
  id: number
  totalAmount: number
  monthlyInstallment: number
  remainingAmount: number
  loanDate: string
}

const loanColumnHelper = createColumnHelper<EmployeeLoanRow>()

export function EmployeeLoansTable({
  data,
  canSeeSalary,
}: {
  data: EmployeeLoanRow[]
  canSeeSalary: boolean
}) {
  const columns = useMemo(
    () => [
      loanColumnHelper.accessor("totalAmount", {
        header: "Jumlah",
        meta: { align: "right", mobilePrimary: true },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">
            {canSeeSalary ? formatCurrencyExact(info.getValue()) : "••••••"}
          </div>
        ),
      }),
      loanColumnHelper.accessor("monthlyInstallment", {
        header: "Cicilan",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">
            {canSeeSalary ? formatCurrencyExact(info.getValue()) : "••••••"}
          </div>
        ),
      }),
      loanColumnHelper.accessor("remainingAmount", {
        header: "Sisa",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums text-danger">
            {canSeeSalary ? formatCurrencyExact(info.getValue()) : "••••••"}
          </div>
        ),
      }),
      loanColumnHelper.accessor("loanDate", {
        header: "Mulai",
        cell: (info) => formatDate(info.getValue()),
      }),
    ],
    [canSeeSalary],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Pinjaman aktif karyawan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface EmployeeLeaveRow {
  id: number
  type: string
  startDate: string
  endDate: string
  status: string
  reason: string | null
}

const leaveColumnHelper = createColumnHelper<EmployeeLeaveRow>()

const leaveColumns = [
  leaveColumnHelper.accessor("type", {
    header: "Jenis",
    meta: { mobilePrimary: true },
    cell: (info) => labelFrom(LEAVE_TYPE_LABELS, info.getValue()),
  }),
  leaveColumnHelper.accessor("startDate", {
    header: "Tanggal Mulai",
    cell: (info) => formatDate(info.getValue()),
  }),
  leaveColumnHelper.accessor("endDate", {
    header: "Tanggal Selesai",
    cell: (info) => formatDate(info.getValue()),
  }),
  leaveColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  leaveColumnHelper.accessor("reason", {
    header: "Alasan",
    cell: (info) => {
      const reason = info.getValue()
      return reason ? (reason.length > 30 ? `${reason.substring(0, 30)}...` : reason) : "-"
    },
  }),
]

export function EmployeeLeavesTable({ data }: { data: EmployeeLeaveRow[] }) {
  return (
    <DataTable
      data={data}
      columns={leaveColumns}
      ariaLabel="Riwayat cuti karyawan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface EmployeeOvertimeRow {
  id: number
  date: string
  hours: number
  status: string
  reason: string | null
}

const overtimeColumnHelper = createColumnHelper<EmployeeOvertimeRow>()

const overtimeColumns = [
  overtimeColumnHelper.accessor("date", {
    header: "Tanggal",
    meta: { mobilePrimary: true },
    cell: (info) => formatDate(info.getValue()),
  }),
  overtimeColumnHelper.accessor("hours", {
    header: "Jam",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">{info.getValue()} jam</div>
    ),
  }),
  overtimeColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  overtimeColumnHelper.accessor("reason", {
    header: "Alasan",
    cell: (info) => {
      const reason = info.getValue()
      return reason ? (reason.length > 30 ? `${reason.substring(0, 30)}...` : reason) : "-"
    },
  }),
]

export function EmployeeOvertimesTable({ data }: { data: EmployeeOvertimeRow[] }) {
  return (
    <DataTable
      data={data}
      columns={overtimeColumns}
      ariaLabel="Riwayat lembur karyawan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface EmployeePayrollRow {
  id: number
  documentNo: string
  period: string
  baseSalary: number
  netSalary: number
  status: string
}

const payrollColumnHelper = createColumnHelper<EmployeePayrollRow>()

export function EmployeePayrollsTable({
  data,
  canSeeSalary,
}: {
  data: EmployeePayrollRow[]
  canSeeSalary: boolean
}) {
  const columns = useMemo(
    () => [
      payrollColumnHelper.accessor("documentNo", {
        header: "No. Dokumen",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-mono">{info.getValue()}</span>,
      }),
      payrollColumnHelper.accessor("period", {
        header: "Periode",
      }),
      payrollColumnHelper.accessor("baseSalary", {
        header: "Gaji Pokok",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">
            {canSeeSalary ? formatCurrencyExact(info.getValue()) : "••••••"}
          </div>
        ),
      }),
      payrollColumnHelper.accessor("netSalary", {
        header: "Gaji Bersih",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums font-semibold">
            {canSeeSalary ? formatCurrencyExact(info.getValue()) : "••••••"}
          </div>
        ),
      }),
      payrollColumnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusChip status={info.getValue()} />,
      }),
    ],
    [canSeeSalary],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Riwayat penggajian karyawan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
