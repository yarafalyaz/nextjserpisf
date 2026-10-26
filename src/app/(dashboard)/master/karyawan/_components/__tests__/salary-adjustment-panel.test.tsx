// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createElement, act, type ReactElement } from "react"

const mocks = vi.hoisted(() => ({
  actions: {
    approveSalaryAdjustment: vi.fn().mockResolvedValue({ success: true, status: "scheduled" }),
    rejectSalaryAdjustment: vi.fn().mockResolvedValue({ success: true, status: "ditolak" }),
    cancelSalaryAdjustment: vi.fn().mockResolvedValue({ success: true }),
    createSalaryAdjustment: vi.fn().mockResolvedValue({ success: true, id: 9, applied: false, status: "menunggu" }),
  },
  toast: { showSuccess: vi.fn(), showError: vi.fn() },
  nav: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  failing: false,
}))

vi.mock("next/navigation", () => ({ useRouter: () => mocks.nav }))
vi.mock("@/lib/utils/toast", () => mocks.toast)

// Plumbing tes: date picker nyata = popover kalender (rapuh di jsdom).
vi.mock("@/components/ui/date-picker", async () => {
  const React = await import("react")
  return {
    AppDatePicker: ({ name, onChange }: { name: string; onChange?: (v: string) => void }) =>
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": `datepicker-${name}`,
          onClick: () => onChange?.("2026-11-01"),
        },
        "Pilih tanggal",
      ),
  }
})

vi.mock("@/actions/salary-adjustment.actions", () => ({
  approveSalaryAdjustment: (...a: unknown[]) =>
    mocks.failing
      ? Promise.resolve({ success: false, error: "Penyesuaian gaji sudah diputus atau tidak lagi menunggu persetujuan" })
      : mocks.actions.approveSalaryAdjustment(...a),
  rejectSalaryAdjustment: mocks.actions.rejectSalaryAdjustment,
  cancelSalaryAdjustment: mocks.actions.cancelSalaryAdjustment,
  createSalaryAdjustment: mocks.actions.createSalaryAdjustment,
}))

import {
  SalaryAdjustmentPanel,
  type SalaryAdjustmentPanelProps,
  type SalaryAdjustmentRow,
} from "../salary-adjustment-panel"
import { mountInto, unmount } from "@/components/forms/__tests__/form-a11y-test-utils"

function row(over: Partial<SalaryAdjustmentRow> = {}): SalaryAdjustmentRow {
  return {
    id: 11,
    effectiveDate: "2026-11-01T00:00:00.000Z",
    previousBaseSalary: 5000000,
    newBaseSalary: 5500000,
    changePercent: 10,
    reason: "berkala",
    notes: "Siklus tahunan",
    status: "menunggu",
    appliedAt: null,
    createdBy: 3,
    approvedBy: null,
    rejectedBy: null,
    rejectionReason: null,
    decidedAt: null,
    createdAt: "2026-10-20T00:00:00.000Z",
    ...over,
  }
}

function base(over: Partial<SalaryAdjustmentPanelProps> = {}): SalaryAdjustmentPanelProps {
  return {
    employeeId: 7,
    rows: [row()],
    autoCancelledBerhenti: 0,
    loadError: null,
    canEdit: true,
    canApprove: true,
    currentUserId: 99,
    ...over,
  }
}

function el(props: SalaryAdjustmentPanelProps): ReactElement {
  return createElement(SalaryAdjustmentPanel, props)
}

async function click(button: Element) {
  await act(async () => {
    ;(button as HTMLButtonElement).click()
  })
}

function buttonsByText(container: HTMLElement, text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement[]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.failing = false
})

describe("SalaryAdjustmentPanel — F-2026-10-26-054-S", () => {
  it("nominal + status + persen tampil verbatim loader (tanpa hitung ulang)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base()))
      const text = container.textContent ?? ""
      expect(text).toContain("Rp 5.000.000")
      expect(text).toContain("Rp 5.500.000")
      expect(text).toContain("+10%")
      expect(text).toContain("Menunggu")
      expect(text).toContain("Kenaikan Berkala")
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("status scheduled/applied/ditolak memakai label pusat; alasan tolak verbatim", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(
        container,
        el(
          base({
            rows: [
              row({ id: 1, status: "scheduled" }),
              row({ id: 2, status: "applied" }),
              row({
                id: 3,
                status: "ditolak",
                rejectionReason: "Anggaran belum disetujui",
                decidedAt: "2026-10-21T00:00:00.000Z",
              }),
            ],
          }),
        ),
      )
      const text = container.textContent ?? ""
      expect(text).toContain("Terjadwal")
      expect(text).toContain("Diterapkan")
      expect(text).toContain("Ditolak")
      expect(text).toContain("Anggaran belum disetujui")
      // Baris non-menunggu tidak boleh punya tombol putusan.
      expect(buttonsByText(container, "Setujui")).toHaveLength(0)
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("status tak dikenal tampil apa adanya, tidak dipetakan paksa", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base({ rows: [row({ status: "status_asing_xyz" })] })))
      expect(container.textContent).toContain("status_asing_xyz")
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("tanpa izin approve: tombol Setujui/Tolak mati + petunjuk izin (fail-closed)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base({ canApprove: false })))
      expect(buttonsByText(container, "Setujui")[0].disabled).toBe(true)
      expect(buttonsByText(container, "Tolak")[0].disabled).toBe(true)
      expect(container.textContent).toContain("Memerlukan izin menyetujui penyesuaian gaji")
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("pengaju sendiri: tombol putusan mati walau memegang izin (maker-checker UI)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base({ currentUserId: 3 })))
      expect(buttonsByText(container, "Setujui")[0].disabled).toBe(true)
      expect(container.textContent).toContain("Pengaju tidak dapat memutus penyesuaian sendiri")
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("Setujui memanggil approveSalaryAdjustment(id) lalu refresh", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base()))
      await click(buttonsByText(container, "Setujui")[0])
      expect(mocks.actions.approveSalaryAdjustment).toHaveBeenCalledWith(11)
      expect(mocks.nav.refresh).toHaveBeenCalled()
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("Tolak mati selama alasan kosong; aktif sesudah alasan diisi, alasan terkirim verbatim", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base()))
      const tolak = buttonsByText(container, "Tolak")[0]
      expect(tolak.disabled).toBe(true)
      const input = container.querySelector<HTMLInputElement>("#salary-reject-reason-11")!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
        setter.call(input, "Di luar struktur gaji")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
      expect(buttonsByText(container, "Tolak")[0].disabled).toBe(false)
      await click(buttonsByText(container, "Tolak")[0])
      expect(mocks.actions.rejectSalaryAdjustment).toHaveBeenCalledWith(11, "Di luar struktur gaji")
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("error server (balapan putusan) tampil verbatim lewat toast", async () => {
    mocks.failing = true
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base()))
      await click(buttonsByText(container, "Setujui")[0])
      expect(mocks.toast.showError).toHaveBeenCalledWith(
        "Penyesuaian gaji sudah diputus atau tidak lagi menunggu persetujuan",
      )
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("notice batal otomatis karyawan berhenti tampil dari angka server", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base({ autoCancelledBerhenti: 2 })))
      expect(container.textContent).toContain(
        "2 penyesuaian dibatalkan otomatis karena karyawan telah berhenti.",
      )
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("kosong + error muat tampil eksplisit", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      let root = mountInto(container, el(base({ rows: [] })))
      expect(container.textContent).toContain("Belum ada penyesuaian gaji tercatat.")
      unmount(root, container)
      root = mountInto(container, el(base({ loadError: "Anda tidak memiliki izin melihat nominal gaji" })))
      expect(container.textContent).toContain("Anda tidak memiliki izin melihat nominal gaji")
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("tanpa canEdit: form catat tidak dirender", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base({ canEdit: false })))
      expect(buttonsByText(container, "Catat Kenaikan")).toHaveLength(0)
      unmount(root, container)
    } finally {
      container.remove()
    }
  })

  it("submit form catat mengirim FormData verbatim; sukses toast menunggu persetujuan", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    try {
      const root = mountInto(container, el(base()))
      const amount = container.querySelector<HTMLInputElement>("#salary-new-base")!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
        setter.call(amount, "6000000")
        amount.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await click(container.querySelector('[data-testid="datepicker-salary-effective-date"]')!)
      const form = container.querySelector("form")!
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })
      expect(mocks.actions.createSalaryAdjustment).toHaveBeenCalledTimes(1)
      const fd = mocks.actions.createSalaryAdjustment.mock.calls[0][0] as FormData
      expect(fd.get("employeeId")).toBe("7")
      expect(fd.get("newBaseSalary")).toBe("6000000")
      expect(fd.get("effectiveDate")).toBe("2026-11-01")
      expect(fd.get("reason")).toBe("berkala")
      expect(mocks.toast.showSuccess).toHaveBeenCalledWith(
        "Pengajuan penyesuaian gaji dicatat dan menunggu persetujuan",
      )
      unmount(root, container)
    } finally {
      container.remove()
    }
  })
})
