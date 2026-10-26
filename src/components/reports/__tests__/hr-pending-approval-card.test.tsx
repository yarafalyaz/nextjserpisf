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

const TODAY = new Date("2026-10-25T05:00:00.000Z")
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const base: HrPendingApprovalInput = {
  id: 1, kind: "leave", employeeId: 10, employeeName: "Budi Santoso",
  departmentName: "Bengkel", slug: "budi-cuti", status: "pending",
  createdAt: d("2026-10-20"), eventDate: d("2026-10-26"), endDate: d("2026-10-27"),
  leaveType: "annual", hours: null, reason: "urusan keluarga", projectName: null,
  loanTotalAmount: null, loanMonthlyInstallment: null, loanWeeklyInstallment: null,
}
const overtime: HrPendingApprovalInput = {
  ...base, id: 2, kind: "overtime", employeeName: "Siti Rahma", departmentName: null,
  slug: "siti-lembur", createdAt: d("2026-10-24"), eventDate: d("2026-10-24"),
  endDate: null, leaveType: null, hours: "2.50", reason: "kejar target", projectName: "Proyek Alpha",
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((r) => act(() => r.unmount()))
  roots = []
  document.body.replaceChildren()
})

function renderCard(inputs: HrPendingApprovalInput[]) {
  const rows = buildHrPendingApprovalQueue(inputs, TODAY)
  const el = document.createElement("div")
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  act(() => root.render(<HrPendingApprovalCard rows={rows} />))
  return { text: el.textContent ?? "", hrefs: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")), table: el.querySelector("table") }
}

describe("HrPendingApprovalCard F-2026-10-25-007-S", () => {
  it("verbatim builder + notice; tanpa nominal (AC-HP-F1/BR-HP-08)", () => {
    const { text, hrefs } = renderCard([base, overtime])
    expect(text).toContain(HR_PENDING_NOTICE_TEXT)
    expect(text).toContain("Mengendap")
    expect(text).toContain("Mendekati Tanggal Mulai")
    expect(text).toContain("Tanggal Lewat Belum Diputus")
    expect(text).toContain("5 hari")
    expect(text).toContain("Cuti Tahunan")
    expect(text).toContain("2.50 jam")
    expect(text).toContain("Proyek Alpha")
    expect(text).toContain("—")
    expect(text).not.toMatch(/Rp|calculatedValue/i)
    expect(hrefs).toEqual(expect.arrayContaining(["/sdm/cuti/budi-cuti", "/sdm/lembur/siti-lembur"]))
  })

  it("slug kosong jatuh ke id; kosong tanpa tabel", () => {
    expect(renderCard([{ ...base, slug: null }]).hrefs).toContain("/sdm/cuti/1")
    const empty = renderCard([])
    expect(empty.text).toContain("Belum ada pengajuan cuti atau lembur yang menunggu keputusan")
    expect(empty.table).toBeNull()
  })
})
