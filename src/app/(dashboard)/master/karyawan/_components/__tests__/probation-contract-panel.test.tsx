// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createElement, type ReactElement } from "react"

const mocks = vi.hoisted(() => ({
  actions: {
    openProbation: vi.fn().mockResolvedValue({ success: true }),
    closeProbation: vi.fn().mockResolvedValue({ success: true }),
    saveProbationReviewDraft: vi.fn().mockResolvedValue({ success: true }),
    submitProbationReview: vi.fn().mockResolvedValue({ success: true }),
    decideProbation: vi.fn().mockResolvedValue({ success: true }),
    createContractDecisionRequest: vi.fn().mockResolvedValue({ success: true }),
    submitContractDecisionRequest: vi.fn().mockResolvedValue({ success: true }),
    approveContractDecisionRequest: vi.fn().mockResolvedValue({ success: true }),
    rejectContractDecisionRequest: vi.fn().mockResolvedValue({ success: true }),
    cancelContractDecisionRequest: vi.fn().mockResolvedValue({ success: true }),
    applyContractDecisionRequest: vi.fn().mockResolvedValue({ success: true }),
  },
  toast: { showSuccess: vi.fn(), showError: vi.fn() },
  nav: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  failing: false,
}))

vi.mock("next/navigation", () => ({ useRouter: () => mocks.nav }))
vi.mock("@/lib/utils/toast", () => mocks.toast)

// Plumbing tes: date picker nyata = popover kalender (rapuh di jsdom).
// Mock hanya di berkas tes ini — memanggil onChange dengan tanggal tetap.
vi.mock("@/components/ui/date-picker", async () => {
  const React = await import("react")
  return {
    AppDatePicker: ({ name, onChange }: { name: string; onChange?: (v: string) => void }) =>
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": `datepicker-${name}`,
          onClick: () => onChange?.("2026-10-30"),
        },
        "Pilih tanggal",
      ),
  }
})

vi.mock("@/actions/probation.actions", () => ({
  openProbation: (...a: unknown[]) => mocks.failing
    ? Promise.resolve({ success: false, error: "Masa percobaan hanya dapat dibuka untuk karyawan Tetap (PKWTT)" })
    : mocks.actions.openProbation(...a),
  closeProbation: mocks.actions.closeProbation,
  saveProbationReviewDraft: mocks.actions.saveProbationReviewDraft,
  submitProbationReview: mocks.actions.submitProbationReview,
  decideProbation: mocks.actions.decideProbation,
  createContractDecisionRequest: mocks.actions.createContractDecisionRequest,
  submitContractDecisionRequest: mocks.actions.submitContractDecisionRequest,
  approveContractDecisionRequest: mocks.actions.approveContractDecisionRequest,
  rejectContractDecisionRequest: mocks.actions.rejectContractDecisionRequest,
  cancelContractDecisionRequest: mocks.actions.cancelContractDecisionRequest,
  applyContractDecisionRequest: mocks.actions.applyContractDecisionRequest,
}))

import { ProbationContractPanel, type ProbationContractPanelProps } from "../probation-contract-panel"
import { EmployeeLifecycleAttentionCard } from "../employee-lifecycle-attention-card"
import { mountInto, unmount, withContainer } from "@/components/forms/__tests__/form-a11y-test-utils"
import { act } from "react"

function base(over: Partial<ProbationContractPanelProps> = {}): ProbationContractPanelProps {
  return {
    employeeId: 7,
    employmentStatus: "PKWTT",
    employmentStatusLabel: "Tetap (PKWTT)",
    joinDate: "2026-08-01T00:00:00.000Z",
    probationEndDate: "2026-10-30T00:00:00.000Z",
    derivedStatusLabel: "Dalam percobaan",
    milestones: [
      {
        milestone: "30", label: "Evaluasi Hari ke-30", dueDate: "2026-08-31T00:00:00.000Z",
        isFinal: false, reviewStatus: null, reviewId: null, reviewerEmployeeId: null,
        technicalScore: null, disciplineScore: null, attendanceScore: null, notes: null, recommendation: null,
      },
      {
        milestone: "90", label: "Evaluasi Hari ke-90", dueDate: "2026-10-30T00:00:00.000Z",
        isFinal: true, reviewStatus: "submitted", reviewId: 11, reviewerEmployeeId: 3,
        technicalScore: "baik", disciplineScore: "cukup", attendanceScore: "perlu_perhatian",
        notes: "Kehadiran perlu dibina", recommendation: "perhatian_khusus",
      },
    ],
    decisions: [
      {
        id: 5, kind: "extend_pkwt", kindLabel: "Perpanjang Kontrak (PKWT)",
        proposedContractEndDate: "2027-06-30T00:00:00.000Z", reason: "Proyek berlanjut",
        status: "submitted", statusLabel: "Diajukan", rejectionReason: null,
        createdAt: "2026-10-20T00:00:00.000Z",
      },
    ],
    decisionsError: null,
    reviewerOptions: [{ id: 3, name: "Sari Penilai" }],
    canEdit: true,
    canApprove: true,
    ...over,
  }
}

function el(props: ProbationContractPanelProps): ReactElement {
  return createElement(ProbationContractPanel, props)
}

async function withContainerAsync(run: (container: HTMLElement) => Promise<void>) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  try {
    await run(container)
  } finally {
    container.remove()
  }
}

async function click(button: Element) {
  await act(async () => {
    ;(button as HTMLButtonElement).click()
  })
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text))
  if (!btn) throw new Error(`tombol tidak ditemukan: ${text}`)
  return btn as HTMLButtonElement
}

describe("ProbationContractPanel — F-2026-10-24-099-S", () => {
  it("render kategori kata tanpa angka/bintang; submitted tampil nilai tersimpan apa adanya", () => {
    withContainer((container) => {
      const root = mountInto(container, el(base()))
      const text = container.textContent ?? ""
      expect(text).toContain("Masa Percobaan")
      expect(text).toContain("Evaluasi Hari ke-30")
      expect(text).toContain("Evaluasi Hari ke-90")
      expect(text).toContain("Baik")
      expect(text).toContain("Cukup")
      // Label builder verbatim: huruf kapital sesuai PROBATION_SCORE_LABELS.
      expect(text).toContain("Perlu Perhatian")
      expect(text).toContain("Perhatian Khusus")
      expect(text).toContain("belum diisi")
      expect(text).toContain("Perpanjang Kontrak (PKWT)")
      expect(text).toContain("Keputusan Kontrak")
      // Tanpa skor angka/bintang/rata-rata turunan.
      expect(text).not.toMatch(/\b[0-9]+(?:[.,][0-9]+)?\s*(?:\/\s*[0-9]+|dari 100|%)\b/)
      expect(text).not.toContain("★")
      expect(text.toLowerCase()).not.toContain("rata-rata")
      // Nol nominal gaji/kompensasi (AC-PROB-8 sisi UI).
      expect(text).not.toContain("Rp")
      expect(text.toLowerCase()).not.toContain("gaji")
      expect(text.toLowerCase()).not.toContain("kompensasi")
      unmount(root, container)
    })
  })

  it("tanpa izin approve: tombol Putuskan/Setujui tidak tampil; tanpa edit: form tidak tampil", () => {
    withContainer((container) => {
      const root = mountInto(container, el(base({ canApprove: false, canEdit: false })))
      const text = container.textContent ?? ""
      expect(text).not.toContain("Putuskan Masa Percobaan")
      expect(text).not.toContain("Setujui")
      expect(text).not.toContain("Buat Pengajuan")
      expect(text).not.toContain("Simpan Draf")
      unmount(root, container)
    })
  })

  it("catatan ditandai wajib bila ada nilai awal Perlu Perhatian (submitted tetap terbaca)", () => {
    withContainer((container) => {
      const root = mountInto(container, el(base({
        milestones: [{
          milestone: "30", label: "Evaluasi Hari ke-30", dueDate: "2026-08-31T00:00:00.000Z",
          isFinal: false, reviewStatus: "draft", reviewId: 9, reviewerEmployeeId: 3,
          technicalScore: "perlu_perhatian", disciplineScore: "cukup", attendanceScore: "baik",
          notes: null, recommendation: "lanjut",
        }],
      })))
      const notes = container.querySelector("#notes-30") as HTMLTextAreaElement
      expect(notes).not.toBeNull()
      expect(notes.required).toBe(true)
      expect(container.textContent).toContain("Catatan wajib diisi bila ada sumbu Perlu Perhatian atau rekomendasi bukan Lanjut.")
      unmount(root, container)
    })
  })

  it("error server tampil verbatim lewat toast saat buka probation ditolak", async () => {
    mocks.failing = true
    mocks.toast.showError.mockClear()
    try {
      await withContainerAsync(async (container) => {
        const root = mountInto(container, el(base({
          probationEndDate: null,
          derivedStatusLabel: null,
          milestones: [],
        })))
        await click(container.querySelector('[data-testid="datepicker-probation-end"]')!)
        await click(buttonByText(container, "Buka Masa Percobaan"))
        expect(mocks.toast.showError).toHaveBeenCalledWith(
          "Masa percobaan hanya dapat dibuka untuk karyawan Tetap (PKWTT)",
        )
        unmount(root, container)
      })
    } finally {
      mocks.failing = false
    }
  })

  it("kirim evaluasi memanggil submitProbationReview dengan id baris server", async () => {
    mocks.actions.submitProbationReview.mockClear()
    await withContainerAsync(async (container) => {
      const root = mountInto(container, el(base({
        milestones: [{
          milestone: "30", label: "Evaluasi Hari ke-30", dueDate: "2026-08-31T00:00:00.000Z",
          isFinal: false, reviewStatus: "draft", reviewId: 9, reviewerEmployeeId: 3,
          technicalScore: "baik", disciplineScore: "baik", attendanceScore: "baik",
          notes: "Stabil", recommendation: "lanjut",
        }],
      })))
      await click(buttonByText(container, "Kirim Evaluasi"))
      expect(mocks.actions.submitProbationReview).toHaveBeenCalledWith(9)
      unmount(root, container)
    })
  })

  it("daftar perhatian existing merender 3 label F-099 verbatim dari baris server", () => {
    const mk = (kind: string, label: string) => ({
      employeeId: 7, name: "Budi Uji", kind: kind as never, label,
      employmentStatus: "PKWT", employmentStatusLabel: "Kontrak (PKWT)",
      contractEndDate: null, employmentEndedAt: null, endReason: null, endReasonLabel: null, isActive: true,
    })
    withContainer((container) => {
      const root = mountInto(container, createElement(EmployeeLifecycleAttentionCard, {
        rows: [
          mk("probationDue", "Evaluasi percobaan jatuh tempo"),
          mk("probationOverdue", "Percobaan lewat, belum diputus"),
          mk("contractDecisionPending", "Keputusan kontrak menunggu penerapan"),
        ],
      }))
      const text = container.textContent ?? ""
      expect(text).toContain("Evaluasi percobaan jatuh tempo")
      expect(text).toContain("Percobaan lewat, belum diputus")
      expect(text).toContain("Keputusan kontrak menunggu penerapan")
      unmount(root, container)
    })
  })

  it("form keputusan kontrak: label jenis verbatim spec §10", () => {
    withContainer((container) => {
      const root = mountInto(container, el(base()))
      const text = container.textContent ?? ""
      expect(text).toContain("Ajukan Keputusan Kontrak")
      expect(text).toContain("Alasan Pengajuan")
      unmount(root, container)
    })
  })
})
