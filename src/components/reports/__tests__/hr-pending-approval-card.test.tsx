// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { HrPendingApprovalCard } from "../hr-pending-approval-card"
import {
  buildHrPendingApprovalQueue,
  HR_PENDING_NOTICE_TEXT,
  type HrPendingApprovalInput,
} from "@/lib/reports/hr-pending-approval"

// Hari acuan WIB: 2026-10-25 12:00 WIB = 05:00 UTC.
const TODAY = new Date("2026-10-25T05:00:00.000Z")
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function input(partial: Partial<HrPendingApprovalInput>): HrPendingApprovalInput {
  return {
    id: 1,
    kind: "leave",
    employeeId: 10,
    employeeName: "Budi Santoso",
    departmentName: "Bengkel",
    slug: "budi-cuti",
    status: "pending",
    createdAt: d("2026-10-20"),
    eventDate: d("2026-10-26"),
    endDate: d("2026-10-27"),
    leaveType: "annual",
    hours: null,
    reason: "urusan keluarga",
    projectName: null,
    ...partial,
  }
}

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  roots.push(root)
  return container
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => act(() => root.unmount()))
  roots = []
  document.body.replaceChildren()
})

describe("HrPendingApprovalCard F-2026-10-25-007-S", () => {
  it("tahap/umur/sisa tampil verbatim builder + notice; tanpa nominal (AC-HP-F1/BR-HP-08)", () => {
    const rows = buildHrPendingApprovalQueue(
      [
        input({}),
        input({
          id: 2,
          kind: "overtime",
          employeeName: "Siti Rahma",
          departmentName: null,
          slug: "siti-lembur",
          createdAt: d("2026-10-24"),
          eventDate: d("2026-10-24"),
          endDate: null,
          leaveType: null,
          hours: "2.50",
          reason: "kejar target",
          projectName: "Proyek Alpha",
        }),
      ],
      TODAY,
    )
    const container = render(<HrPendingApprovalCard rows={rows} />)
    const text = container.textContent ?? ""
    expect(text).toContain(HR_PENDING_NOTICE_TEXT)
    expect(text).toContain("Mengendap")
    expect(text).toContain("Mendekati Tanggal Mulai")
    expect(text).toContain("Tanggal Lewat Belum Diputus")
    expect(text).toContain("5 hari")
    expect(text).toContain("1 hari")
    expect(text).toContain("Cuti Tahunan")
    expect(text).toContain("2.50 jam")
    expect(text).toContain("Proyek Alpha")
    // Karyawan tanpa departemen tampil — (BR-HP-12).
    expect(text).toContain("—")
    // Tanpa nominal lembur/gaji apa pun (BR-HP-08).
    expect(text).not.toMatch(/Rp|c calculatedValue/i)
    expect(text).not.toContain("calculatedValue")
    // Tautan hanya ke detail existing per jenis (AC-HP-F2).
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs).toContain("/sdm/lembur/siti-lembur")
    expect(hrefs).toContain("/sdm/cuti/budi-cuti")
  })

  it("slug kosong jatuh ke id dokumen di tautan detail", () => {
    const rows = buildHrPendingApprovalQueue([input({ slug: null })], TODAY)
    const container = render(<HrPendingApprovalCard rows={rows} />)
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs).toContain("/sdm/cuti/1")
  })

  it("tanpa tombol keputusan di antrean (AC-HP-F2): hanya tautan detail", () => {
    const rows = buildHrPendingApprovalQueue([input({})], TODAY)
    const container = render(<HrPendingApprovalCard rows={rows} />)
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("form")).toBeNull()
    expect(container.textContent).not.toContain("Setujui")
    expect(container.textContent).not.toContain("Tolak")
  })

  it("kosong: empty state tampil, tabel tidak tampil", () => {
    const container = render(<HrPendingApprovalCard rows={[]} />)
    expect(container.textContent).toContain(
      "Belum ada pengajuan cuti atau lembur yang menunggu keputusan",
    )
    expect(container.querySelector("table")).toBeNull()
  })
})
