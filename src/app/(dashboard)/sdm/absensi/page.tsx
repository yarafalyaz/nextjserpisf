export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { canSearchAcrossEmployees, getHrScope, hrEmployeeScopeWhere, hrScopeWhere } from "@/lib/auth/hr-scope"
import { parsePagination } from "@/lib/utils/pagination"
import { formatDate } from "@/lib/utils/format"
import { getWibTodayUtcDate, wibDateToUtcMidnight, wibMinutesOfDay } from "@/lib/utils/attendance-time"
import { endOfUtcDayExclusive } from "@/lib/utils/date-only"
import { PageHeader } from "@/components/ui/page-header"
import { AppSearchField } from "@/components/ui/search-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import Link from "next/link"
import { AttendanceForm } from "./_components/attendance-forms"
import { AttendanceTable } from "./_components/attendance-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Absensi" }

/**
 * Absensi kehadiran: daftar + formulir catat/ubah.
 *
 * Halaman ini SATU-SATUNYA jalur tulis tabel `attendances`. Sebelumnya absensi
 * hanya bisa diisi skrip seed, padahal dasbor kehadiran, notifikasi keterlambatan,
 * potongan keterlambatan, dan ringkasan absensi penggajian MEMBACANYA — jadi
 * angkanya hanya benar pada basis data yang di-seed (atau menampilkan GPS
 * check-in yang tidak bisa dihasilkan alur nyata). Aksi servernya
 * (`createAttendance`/`updateAttendance`/`deleteAttendance`) memakai aturan yang
 * sama dengan halaman ini: create_attendance, edit_attendance, manage_attendance.
 *
 * Pengubahan memakai parameter `?editAbsensi=<id>` (formulir inline, pola yang
 * sama dengan Kalender Kerja) supaya tidak perlu rute `ubah` terpisah.
 *
 * Waktu: `attendance.date` adalah tengah malam UTC untuk hari kalender WIB,
 * sedangkan `checkIn`/`checkOut` adalah instan UTC dari jam dinding WIB. Keduanya
 * dikonversi lewat `attendance-time.ts` — jangan menurunkan tanggal dengan
 * `new Date().toISOString()` dari jam lokal.
 */
function wibTimeLabel(instant: Date | null): string {
  if (!instant) return "-"
  const minutes = wibMinutesOfDay(instant)
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0")
  const rest = String(minutes % 60).padStart(2, "0")
  return `${hours}:${rest}`
}

/**
 * `attendance.date` (tengah malam UTC hari WIB) → `YYYY-MM-DD` untuk
 * `<input type="date">`. Komponen UTC dari nilai ini MEMANG tanggal WIB-nya;
 * mengambil komponen lokal akan menggeser hari saat server berjalan di barat UTC.
 */
function wibDateInputValue(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

/** `?tanggal=YYYY-MM-DD` atau `?bulan=YYYY-MM` → rentang setengah-terbuka `date`. */
function attendanceDateRange(
  tanggal: string | undefined,
  bulan: string | undefined,
): { gte: Date; lt: Date } | undefined {
  // Tanggal lebih spesifik daripada bulan, jadi ia yang dipakai bila keduanya ada.
  if (tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    const start = wibDateToUtcMidnight(tanggal)
    return { gte: start, lt: endOfUtcDayExclusive(start) }
  }
  if (bulan && /^\d{4}-\d{2}$/.test(bulan)) {
    const [year, month] = bulan.split("-").map(Number)
    return {
      gte: wibDateToUtcMidnight(`${bulan}-01`),
      // Awal bulan berikutnya; `month` 1-based, jadi Date.UTC(year, month, 1) tepat.
      lt: new Date(Date.UTC(year, month, 1)),
    }
  }
  return undefined
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    tanggal?: string
    bulan?: string
    editAbsensi?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  const user = await requireAnyPermission([
    "view_attendance",
    "create_attendance",
    "edit_attendance",
    "manage_attendance",
  ])
  const scope = await getHrScope(user)
  const params = await searchParams
  const { page, pageSize, skip, take } = parsePagination(params)

  const range = attendanceDateRange(params.tanggal, params.bulan)
  const where = {
    ...hrScopeWhere(scope),
    ...(range && { date: range }),
    // Pencarian nama bebas hanya bermakna bagi yang jangkauannya lintas karyawan.
    ...(params.cari && canSearchAcrossEmployees(scope) && {
      OR: [{ employee: { name: { contains: params.cari } } }],
    }),
  }

  const editId = Number(params.editAbsensi)
  const hasEditId = Number.isInteger(editId) && editId > 0

  const [employees, attendances, total, editing] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true, deletedAt: null, ...hrEmployeeScopeWhere(scope) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeNo: true },
    }),
    prisma.attendance.findMany({
      where,
      orderBy: [{ date: "desc" }, { employeeId: "asc" }],
      skip,
      take,
      select: {
        id: true,
        date: true,
        checkIn: true,
        checkOut: true,
        status: true,
        lateMinutes: true,
        notes: true,
        employee: { select: { name: true, employeeNo: true } },
      },
    }),
    prisma.attendance.count({ where }),
    hasEditId
      ? prisma.attendance.findFirst({
          // Dibatas jangkauan akses: baris di luar jangkauan tidak boleh terbuka
          // di formulir meski id-nya ditebak dari URL (aksinya juga menolak).
          where: { id: editId, ...hrScopeWhere(scope) },
          select: {
            id: true,
            employeeId: true,
            date: true,
            checkIn: true,
            checkOut: true,
            status: true,
            notes: true,
            employee: { select: { id: true, name: true, employeeNo: true } },
          },
        })
      : null,
  ])

  // Karyawan yang diubah bisa NONAKTIF (atau berhenti), jadi ia mungkin tidak ada
  // di daftar karyawan aktif — tanpa penggabungan ini dropdown tampil kosong dan
  // menyimpan justru mengosongkan karyawannya.
  const employeeOptions = [...employees]
  if (editing && !employeeOptions.some((employee) => employee.id === editing.employeeId)) {
    employeeOptions.push(editing.employee)
  }

  const rows = attendances.map((attendance) => ({
    id: attendance.id,
    employeeName: attendance.employee.name,
    employeeNo: attendance.employee.employeeNo,
    dateLabel: formatDate(attendance.date),
    checkInLabel: wibTimeLabel(attendance.checkIn),
    checkOutLabel: wibTimeLabel(attendance.checkOut),
    lateMinutes: attendance.lateMinutes,
    status: attendance.status,
    notes: attendance.notes,
  }))

  const editingItem = editing
    ? {
        id: editing.id,
        employeeId: editing.employeeId,
        date: wibDateInputValue(editing.date),
        checkIn: editing.checkIn ? wibTimeLabel(editing.checkIn) : "",
        checkOut: editing.checkOut ? wibTimeLabel(editing.checkOut) : "",
        status: editing.status,
        notes: editing.notes ?? "",
      }
    : undefined

  const userRoles: string[] = user.roles ?? []
  const userPerms: string[] = user.permissions ?? []
  const isSuperAdmin = userRoles.includes("super_admin")
  const canCreate = isSuperAdmin || userPerms.includes("create_attendance")
  const showActions =
    isSuperAdmin || userPerms.includes("edit_attendance") || userPerms.includes("manage_attendance")

  // Hari/bulan berjalan menurut kalender WIB; nilai WIB-nya diambil dari komponen
  // UTC `getWibTodayUtcDate()` (lihat catatan di halaman ini soal konvensi waktu).
  const todayWib = wibDateInputValue(getWibTodayUtcDate())
  const monthWib = todayWib.slice(0, 7)

  const filterChips = [
    { label: "Semua", href: "/sdm/absensi", active: !params.tanggal && !params.bulan },
    {
      label: "Hari Ini",
      href: `/sdm/absensi?tanggal=${todayWib}`,
      active: params.tanggal === todayWib,
    },
    {
      label: "Bulan Ini",
      href: `/sdm/absensi?bulan=${monthWib}`,
      active: params.bulan === monthWib,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Absensi"
        subtitle="Catat kehadiran harian karyawan: jam masuk/keluar dihitung dari jadwal kerja untuk keterlambatan dan lembur."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Absensi" },
        ]}
      />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              {editingItem ? "Ubah Absensi" : "Catat Absensi"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Satu karyawan hanya boleh punya satu absensi per tanggal.
            </p>
          </div>
        </div>

        {canCreate || editingItem ? (
          // `key` memaksa REMOUNT saat target ubah berubah. Tanpa ini React
          // memakai ulang formulir yang sudah ter-mount saat navigasi klien
          // (`router.push("?editAbsensi=…")` dari menu aksi), dan `defaultValue`
          // pada input/select tak terkendali HANYA berlaku saat mount — akibatnya
          // formulir menampilkan nilai lama/kosong dan menyimpan justru
          // mengosongkan karyawan serta jam yang sudah tercatat.
          <AttendanceForm
            key={editingItem ? `edit-${editingItem.id}` : "baru"}
            employees={employeeOptions}
            item={editingItem}
          />
        ) : (
          <p className="p-4 px-5 text-sm text-muted-foreground">
            Anda tidak memiliki izin untuk mencatat atau mengubah absensi.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <form
          method="get"
          action="/sdm/absensi"
          aria-label="Filter absensi"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterTanggal">Tanggal</Label>
            <Input
              id="filterTanggal"
              name="tanggal"
              type="date"
              defaultValue={params.tanggal ?? ""}
              className="w-44"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterBulan">Bulan</Label>
            <Input
              id="filterBulan"
              name="bulan"
              type="month"
              defaultValue={params.bulan ?? ""}
              className="w-40"
            />
          </div>
          <Button type="submit" variant="primary">
            Terapkan
          </Button>
          <Link href="/sdm/absensi" className="text-sm text-primary hover:underline pb-2.5">
            Atur ulang filter
          </Link>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {filterChips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              className={`filter-chip ${chip.active ? "active" : ""}`}
            >
              {chip.label}
            </Link>
          ))}
        </div>

        <AttendanceTable
          data={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          showActions={showActions}
          toolbar={<AppSearchField placeholder="Cari nama karyawan..." action="/sdm/absensi" />}
        />
      </div>
    </div>
  )
}
