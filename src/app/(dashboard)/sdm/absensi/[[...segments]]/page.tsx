export const dynamic = "force-dynamic"

import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { canSearchAcrossEmployees, getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import { parsePagination } from "@/lib/utils/pagination"
import { formatDate } from "@/lib/utils/format"
import { getWibTodayUtcDate, wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { endOfUtcDayExclusive } from "@/lib/utils/date-only"
import { PageHeader } from "@/components/ui/page-header"
import { AppSearchField } from "@/components/ui/search-field"
import Link from "next/link"
import { AttendanceFilterForm } from "../_components/attendance-filter-form"
import { AttendanceTable } from "../_components/attendance-table"
import { wibDateInputValue, wibTimeLabel } from "../_components/attendance-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Absensi" }

/**
 * Absensi kehadiran: daftar kehadiran (formulir catat/ubah di halaman
 * tambah/ubah terpisah).
 *
 * Halaman ini SATU-SATUNYA jalur tulis tabel `attendances`. Sebelumnya absensi
 * hanya bisa diisi skrip seed, padahal dasbor kehadiran, notifikasi keterlambatan,
 * potongan keterlambatan, dan ringkasan absensi penggajian MEMBACANYA — jadi
 * angkanya hanya benar pada basis data yang di-seed (atau menampilkan GPS
 * check-in yang tidak bisa dihasilkan alur nyata). Aksi servernya
 * (`createAttendance`/`updateAttendance`/`deleteAttendance`) memakai aturan yang
 * sama dengan halaman ini: create_attendance, edit_attendance, manage_attendance.
 *
 * Pencatatan & pengubahan memakai halaman terpisah (`/sdm/absensi/tambah`
 * dan `/sdm/absensi/[id]/ubah`, pola yang sama dengan modul SDM lain);
 * halaman ini hanya daftar + filter. Filter tanggal/bulan hidup di PATH
 * sebagai pasangan kunci/nilai (`/tanggal/2026-09-30`, `/bulan/2026-02`),
 * sedangkan pencarian, status, dan pagination tetap query string.
 * Tautan lama `?tanggal=`/`?bulan=`/`?editAbsensi=` diarahkan ke bentuk baru.
 *
 * Waktu: `attendance.date` adalah tengah malam UTC untuk hari kalender WIB,
 * sedangkan `checkIn`/`checkOut` adalah instan UTC dari jam dinding WIB. Keduanya
 * dikonversi lewat `attendance-time.ts` — jangan menurunkan tanggal dengan
 * `new Date().toISOString()` dari jam lokal.
 */
/**
 * Segmen path `tanggal/2026-09-30` / `bulan/2026-02` → filter tanggal.
 * Kunci tak dikenal atau nilai rusak dianggap URL yang salah (404), sama
 * seperti pasangan kunci/nilai filter laporan.
 */
function parseAttendanceSegments(segments: string[] | undefined): { tanggal?: string; bulan?: string } {
  if (!segments?.length) return {}
  if (segments.length % 2 !== 0) notFound()
  const parsed: { tanggal?: string; bulan?: string } = {}
  for (let i = 0; i < segments.length; i += 2) {
    const key = segments[i]
    const value = segments[i + 1]
    if (key === "tanggal" && /^\d{4}-\d{2}-\d{2}$/.test(value)) parsed.tanggal = value
    else if (key === "bulan" && /^\d{4}-\d{2}$/.test(value)) parsed.bulan = value
    else notFound()
  }
  return parsed
}

/** Filter `tanggal=YYYY-MM-DD` / `bulan=YYYY-MM` → rentang setengah-terbuka `date`. */
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
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{
    tanggal?: string
    bulan?: string
    editAbsensi?: string
    cari?: string
    status?: string
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
  const { segments } = await routeParams

  // Tautan lama: `?editAbsensi=<id>` → halaman ubah; `?tanggal=`/`?bulan=`
  // → bentuk path. Query lain (status/cari) dipertahankan, halaman dibuang.
  if (params.editAbsensi) {
    const editId = Number(params.editAbsensi)
    if (Number.isInteger(editId) && editId > 0) redirect(`/sdm/absensi/${editId}/ubah`)
  }
  if (params.tanggal || params.bulan) {
    const legacy = new URLSearchParams()
    if (params.status) legacy.set("status", params.status)
    if (params.cari) legacy.set("cari", params.cari)
    const legacyQuery = legacy.toString()
    const legacyPath = params.tanggal
      ? `/sdm/absensi/tanggal/${params.tanggal}`
      : `/sdm/absensi/bulan/${params.bulan}`
    redirect(legacyQuery ? `${legacyPath}?${legacyQuery}` : legacyPath)
  }

  const { tanggal, bulan } = parseAttendanceSegments(segments)
  const { page, pageSize, skip, take } = parsePagination(params)

  const range = attendanceDateRange(tanggal, bulan)
  // ?status=telat = definisi sama dengan penghitung widget dashboard
  // (status late ATAU lateMinutes > 0).
  const lateOnly = params.status === "telat"
  const canSearch = !!(params.cari && canSearchAcrossEmployees(scope))
  const where = {
    ...hrScopeWhere(scope),
    ...(range && { date: range }),
    // Dua OR (telat + cari) digabung AND eksplisit agar tak saling timpa.
    ...(lateOnly && canSearch
      ? {
          AND: [
            { OR: [{ status: "late" }, { lateMinutes: { gt: 0 } }] },
            { OR: [{ employee: { name: { contains: params.cari } } }] },
          ],
        }
      : {
          ...(lateOnly && {
            OR: [{ status: "late" }, { lateMinutes: { gt: 0 } }],
          }),
          // Pencarian nama bebas hanya bermakna bagi yang jangkauannya lintas karyawan.
          ...(canSearch && {
            OR: [{ employee: { name: { contains: params.cari } } }],
          }),
        }),
  }

  const [attendances, total] = await Promise.all([
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
  ])

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

  const filterPath = segments?.length ? `/sdm/absensi/${segments.join("/")}` : "/sdm/absensi"

  const filterChips = [
    { label: "Semua", href: "/sdm/absensi", active: !tanggal && !bulan },
    {
      label: "Hari Ini",
      href: `/sdm/absensi/tanggal/${todayWib}`,
      active: tanggal === todayWib,
    },
    {
      label: "Bulan Ini",
      href: `/sdm/absensi/bulan/${monthWib}`,
      active: bulan === monthWib,
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
        actions={
          canCreate ? (
            <Link
              href="/sdm/absensi/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            >
              + Catat Absensi
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        <AttendanceFilterForm
          tanggal={tanggal}
          bulan={bulan}
          status={params.status}
          cari={params.cari}
        />

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
          toolbar={<AppSearchField placeholder="Cari nama karyawan..." action={filterPath} />}
        />
      </div>
    </div>
  )
}
