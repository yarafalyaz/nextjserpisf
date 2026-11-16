"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { formatDate } from "@/lib/utils/format"
import {
  deleteHoliday,
  deleteDepartmentHoliday,
  deleteWorkSchedule,
} from "@/actions/hrm.actions"

export interface HolidayRow {
  id: number
  date: string
  name: string
  description: string | null
}

export interface DepartmentHolidayRow {
  id: number
  date: string
  departmentName: string | null
  name: string
}

export interface WorkScheduleRow {
  id: number
  name: string
  workDaysLabel: string
  startTime: string
  endTime: string
  isActive: boolean
}

const holidayHelper = createColumnHelper<HolidayRow>()
const deptHolidayHelper = createColumnHelper<DepartmentHolidayRow>()
const scheduleHelper = createColumnHelper<WorkScheduleRow>()

export function HolidaysTable({
  data,
  canEdit,
  canDelete,
}: {
  data: HolidayRow[]
  canEdit: boolean
  canDelete: boolean
}) {
  const columns = useMemo(
    () => [
      holidayHelper.accessor("date", {
        header: "Tanggal",
        cell: (info) => (
          <span className="font-mono tabular-nums">{formatDate(info.getValue())}</span>
        ),
      }),
      holidayHelper.accessor("name", {
        header: "Nama",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      holidayHelper.accessor("description", {
        header: "Keterangan",
        cell: (info) => info.getValue() ?? "-",
      }),
      holidayHelper.display({
        id: "actions",
        header: "Aksi",
        meta: { align: "right" },
        cell: (info) => {
          const id = info.row.original.id
          return (
            <div className="flex items-center justify-end gap-2">
              {canEdit && (
                <Link
                  href={`/sdm/kalender-kerja/libur/${id}/ubah`}
                  className="text-sm text-primary hover:underline"
                >
                  Ubah
                </Link>
              )}
              {canDelete && <DeleteButton id={id} action={deleteHoliday} />}
            </div>
          )
        },
      }),
    ],
    [canDelete, canEdit],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar hari libur"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export function DepartmentHolidaysTable({
  data,
  canEdit,
  canDelete,
}: {
  data: DepartmentHolidayRow[]
  canEdit: boolean
  canDelete: boolean
}) {
  const columns = useMemo(
    () => [
      deptHolidayHelper.accessor("date", {
        header: "Tanggal",
        cell: (info) => (
          <span className="font-mono tabular-nums">{formatDate(info.getValue())}</span>
        ),
      }),
      deptHolidayHelper.accessor("departmentName", {
        header: "Departemen",
        cell: (info) => info.getValue() ?? "-",
      }),
      deptHolidayHelper.accessor("name", {
        header: "Nama",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      deptHolidayHelper.display({
        id: "actions",
        header: "Aksi",
        meta: { align: "right" },
        cell: (info) => {
          const id = info.row.original.id
          return (
            <div className="flex items-center justify-end gap-2">
              {canEdit && (
                <Link
                  href={`/sdm/kalender-kerja/libur-departemen/${id}/ubah`}
                  className="text-sm text-primary hover:underline"
                >
                  Ubah
                </Link>
              )}
              {canDelete && <DeleteButton id={id} action={deleteDepartmentHoliday} />}
            </div>
          )
        },
      }),
    ],
    [canDelete, canEdit],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar hari libur departemen"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export function WorkSchedulesTable({
  data,
  canEdit,
  canDelete,
}: {
  data: WorkScheduleRow[]
  canEdit: boolean
  canDelete: boolean
}) {
  const columns = useMemo(
    () => [
      scheduleHelper.accessor("name", {
        header: "Nama",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      scheduleHelper.accessor("workDaysLabel", {
        header: "Hari Kerja",
        cell: (info) => info.getValue(),
      }),
      scheduleHelper.display({
        id: "hours",
        header: "Jam",
        cell: (info) => {
          const row = info.row.original
          return (
            <span className="font-mono tabular-nums">
              {row.startTime} - {row.endTime}
            </span>
          )
        },
      }),
      scheduleHelper.accessor("isActive", {
        header: "Status",
        cell: (info) => (
          <StatusChip
            status={info.getValue() ? "active" : "inactive"}
            customLabel={info.getValue() ? "Aktif" : "Nonaktif"}
          />
        ),
      }),
      scheduleHelper.display({
        id: "actions",
        header: "Aksi",
        meta: { align: "right" },
        cell: (info) => {
          const id = info.row.original.id
          return (
            <div className="flex items-center justify-end gap-2">
              {canEdit && (
                <Link
                  href={`/sdm/kalender-kerja/jadwal/${id}/ubah`}
                  className="text-sm text-primary hover:underline"
                >
                  Ubah
                </Link>
              )}
              {canDelete && <DeleteButton id={id} action={deleteWorkSchedule} />}
            </div>
          )
        },
      }),
    ],
    [canDelete, canEdit],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar jadwal kerja"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
