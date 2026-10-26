// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

vi.mock("@/actions/hrm.actions", () => ({
  createAttendanceCorrection: vi.fn(),
  approveAttendanceCorrection: vi.fn(async () => ({ success: true })),
  rejectAttendanceCorrection: vi.fn(async () => ({ success: true })),
  cancelAttendanceCorrection: vi.fn(async () => ({ success: true })),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { AttendanceCorrectionTable } from "../attendance-correction-table"
import {
  buildAttendanceCorrectionQueue,
  type AttendanceCorrectionRowInput,
} from "@/lib/reports/attendance-correction"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const at = (s: string) => new Date(`${s}:00.000Z`)

const base: AttendanceCorrectionRowInput = {
  id: 1,
  employeeId: 10,
  employeeName: "Budi Santoso",
  date: d("2026-10-20"),
  proposedStatus: "present",
  proposedCheckIn: at("2026-10-20T01:00"),
  proposedCheckOut: at("2026-10-20T10:00"),
  proposedNotes: null,
  reason: "lupa absen masuk",
  status: "pending",
  snapshotAttendanceId: 5,
  snapshotUpdatedAt: at("2026-10-20T03:00"),
  snapshotStatus: "absent",
  snapshotCheckIn: null,
  snapshotCheckOut: null,
  snapshotNotes: null,
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
  createdAt: d("2026-10-21"),
  current: {
    id: 5,
    updatedAt: at("2026-10-20T03:00"),
    status: "absent",
    checkIn: null,
    checkOut: null,
    notes: null,
  },
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((r) => act(() => r.unmount()))
  roots = []
  document.body.replaceChildren()
})

function renderTable(
  inputs: AttendanceCorrectionRowInput[],
  props: { currentEmployeeId?: number | null; canApprove?: boolean; canCreate?: boolean } = {},
) {
  const { rows } = buildAttendanceCorrectionQueue(inputs)
  const el = document.createElement("div")
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  act(() =>
    root.render(
      <AttendanceCorrectionTable
        rows={rows}
        currentEmployeeId={props.currentEmployeeId ?? 99}
        canApprove={props.canApprove ?? true}
        canCreate={props.canCreate ?? true}
      />,
    ),
  )
  return el
}

describe("AttendanceCorrectionTable F-2026-10-25-010-S", () => {
  it("3 kolom snapshot/terkini/usulan verbatim + label status", () => {
    const el = renderTable([base])
    const text = el.textContent ?? ""
    const headers = [...el.querySelectorAll("th")].map((th) => th.textContent)
    expect(headers).toEqual([
      "Karyawan / Tanggal",
      "Saat Pengajuan",
      "Rekod Terkini",
      "Usulan Koreksi",
      "Status Pengajuan",
      "Aksi",
    ])
    expect(text).toContain("Budi Santoso")
    expect(text).toContain("Tanpa Keterangan") // snapshot + terkini absent
    expect(text).toContain("Dihadir") // usulan present
    expect(text).toContain("08:00") // usulan checkIn 01:00 UTC = 08:00 WIB
    expect(text).toContain("Alasan: lupa absen masuk")
    expect(text).toContain("Menunggu")
    expect(text).not.toContain("Konflik: Rekod Berubah")
  })

  it("hasConflict pending ditandai; konflik dari builder (current berubah)", () => {
    const conflicted: AttendanceCorrectionRowInput = {
      ...base,
      id: 2,
      current: { ...base.current!, status: "present", checkIn: at("2026-10-20T01:05") },
    }
    const el = renderTable([conflicted])
    expect(el.textContent).toContain("Konflik: Rekod Berubah")
  })

  it("rekod belum ada = status eksplisit, bukan sel kosong", () => {
    const noRecord: AttendanceCorrectionRowInput = {
      ...base,
      id: 3,
      snapshotAttendanceId: null,
      snapshotUpdatedAt: null,
      snapshotStatus: null,
      current: null,
    }
    const el = renderTable([noRecord])
    expect(el.textContent).toContain("Belum ada rekod absensi tercatat")
    // snapshot null + current null = tanpa konflik
    expect(el.textContent).not.toContain("Konflik: Rekod Berubah")
  })

  it("aksi: approver non-pengaju lihat putusan; pengaju lihat batal, bukan putusan sendiri", () => {
    const approver = renderTable([base], { currentEmployeeId: 99 })
    expect(approver.textContent).toContain("Setujui")
    expect(approver.textContent).toContain("Tolak")
    expect(approver.textContent).not.toContain("Batalkan Pengajuan")

    const self = renderTable([base], { currentEmployeeId: 10 })
    expect(self.textContent).toContain("Batalkan Pengajuan")
    expect(self.textContent).not.toContain("Setujui")
  })

  it("baris non-pending tanpa aksi; alasan penolakan tampil", () => {
    const rejected: AttendanceCorrectionRowInput = {
      ...base,
      id: 4,
      status: "rejected",
      rejectionReason: "bukti tidak cukup",
    }
    const el = renderTable([rejected])
    expect(el.textContent).toContain("Ditolak")
    expect(el.textContent).toContain("Alasan penolakan: bukti tidak cukup")
    expect(el.textContent).not.toContain("Setujui")
    expect(el.textContent).not.toContain("Batalkan Pengajuan")
  })

  it("kosong = empty state", () => {
    const el = renderTable([])
    expect(el.textContent).toContain("Belum ada pengajuan koreksi absensi")
  })
})
