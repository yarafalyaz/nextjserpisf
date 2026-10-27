// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  izinKehadiran: vi.fn(),
  cakupanHr: vi.fn(),
  muatRekap: vi.fn(),
  daftarDepartemen: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.izinKehadiran,
}))

vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: mocks.cakupanHr,
}))

vi.mock("@/lib/reports/attendance-recap-data", () => ({
  loadAttendanceRecap: mocks.muatRekap,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { department: { findMany: mocks.daftarDepartemen } },
}))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

import AttendanceRecapPage from "../page"
import { buildAttendanceRecap } from "@/lib/reports/attendance-recap"

const RECAP = buildAttendanceRecap(
  [
    {
      employeeId: 7,
      employeeName: "Budi Santoso",
      departmentId: 2,
      departmentName: "Bengkel",
      hasSchedule: true,
      scheduledDays: [new Date("2026-10-20T00:00:00")],
      holidayDays: [],
      records: [
        {
          date: new Date("2026-10-20T00:00:00"),
          status: "present",
          hasCheckIn: true,
          lateMinutes: 0,
          overtimeMinutes: null,
        },
      ],
      approvedLeaveDays: [],
    },
  ],
  new Date("2026-10-26T00:00:00"),
)

async function renderHalaman(segments: string[] = ["2026-10"]) {
  const node = await AttendanceRecapPage({
    params: Promise.resolve({ segments }),
    searchParams: Promise.resolve({}),
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.izinKehadiran.mockResolvedValue({ id: 1 })
  mocks.cakupanHr.mockResolvedValue({ kind: "all" })
  mocks.muatRekap.mockResolvedValue(RECAP)
  mocks.daftarDepartemen.mockResolvedValue([{ id: 2, name: "Bengkel" }])
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("F-2026-10-25-044-S halaman rekap kehadiran", () => {
  it("gerbang view_attendance + scope server sebelum loader", async () => {
    const { root } = await renderHalaman()
    expect(mocks.izinKehadiran).toHaveBeenCalledWith("view_attendance")
    expect(mocks.cakupanHr).toHaveBeenCalledTimes(1)
    expect(mocks.muatRekap).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
  })

  it("tanpa izin loader tidak dipanggil", async () => {
    mocks.izinKehadiran.mockRejectedValue(new Error("redirect:/"))
    await expect(
      AttendanceRecapPage({
        params: Promise.resolve({ segments: ["2026-10"] }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/")
    expect(mocks.muatRekap).not.toHaveBeenCalled()
  })

  it("baris loader tampil verbatim di halaman", async () => {
    const { container, root } = await renderHalaman()
    const text = container.textContent ?? ""
    expect(text).toContain("Rekap Kehadiran per Karyawan")
    expect(text).toContain("Budi Santoso")
    expect(text).toContain("Rekap kehadiran operasional — bukan dasar potongan gaji.")
    act(() => root.unmount())
  })

  it("scope all: filter departemen path diteruskan ke loader", async () => {
    const { root } = await renderHalaman(["2026-10", "departemen", "2"])
    expect(mocks.muatRekap).toHaveBeenCalledWith(
      { kind: "all" },
      expect.objectContaining({ departmentId: 2 }),
    )
    act(() => root.unmount())
  })

  it("scope bukan all: departemen URL tidak diteruskan, pemilih tidak dimuat", async () => {
    mocks.cakupanHr.mockResolvedValue({ kind: "self", employeeId: 7 })
    const { root } = await renderHalaman(["2026-10", "departemen", "2"])
    expect(mocks.muatRekap).toHaveBeenCalledWith(
      { kind: "self", employeeId: 7 },
      expect.objectContaining({ departmentId: null }),
    )
    expect(mocks.daftarDepartemen).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("kontrak statis: halaman tanpa Prisma kehadiran/hitung ulang", () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/absensi/rekap/[[...segments]]/page.tsx"),
      "utf8",
    )
    expect(pageSource).toContain("loadAttendanceRecap")
    expect(pageSource).toContain('requirePermission("view_attendance")')
    expect(pageSource).not.toContain("calculateAttendanceSummary")
  })
})
