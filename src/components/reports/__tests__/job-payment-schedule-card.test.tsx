// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { act } from "react"
import { renderCard as render, unmountCard, setFieldValue, clickButtonByText } from "./card-test-utils"
import type { JobPaymentScheduleResult } from "@/lib/reports/job-payment-schedule-data"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  createJobPaymentSchedule: vi.fn(),
  updateJobPaymentScheduleTerms: vi.fn(),
  cancelJobPaymentSchedule: vi.fn(),
  createProgressInvoice: vi.fn(),
}))
const {
  push,
  showError,
  showSuccess,
  createJobPaymentSchedule,
  updateJobPaymentScheduleTerms,
  cancelJobPaymentSchedule,
  createProgressInvoice,
} = mocks

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push, replace: vi.fn(), back: vi.fn() }),
}))

vi.mock("@/actions/job-payment-schedule.actions", () => ({
  createJobPaymentSchedule: (...args: unknown[]) => mocks.createJobPaymentSchedule(...args),
  updateJobPaymentScheduleTerms: (...args: unknown[]) => mocks.updateJobPaymentScheduleTerms(...args),
  cancelJobPaymentSchedule: (...args: unknown[]) => mocks.cancelJobPaymentSchedule(...args),
  getJobPaymentScheduleForQuotation: vi.fn(),
}))

vi.mock("@/actions/sales.actions", () => ({
  createProgressInvoice: (...args: unknown[]) => mocks.createProgressInvoice(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { JobPaymentScheduleCard } from "../job-payment-schedule-card"

const schedule: JobPaymentScheduleResult = {
  scheduleId: 3,
  quotationId: 9,
  contractValue: 1_000_000,
  billedAmount: 300_000,
  scheduleLabel: "Jadwal kesepakatan",
  nextTermId: 12,
  allFulfilled: false,
  terms: [
    {
      id: 11,
      name: "DP Awal",
      cumulativePercent: 30,
      targetAmount: 300_000,
      termAmount: 300_000,
      fulfilledAmount: 300_000,
      dueDate: new Date("2026-10-01T00:00:00.000Z"),
      milestoneLabel: "Tanda jadi",
      sortOrder: 0,
      status: "terpenuhi",
      statusLabel: "Terpenuhi",
      overdue: false,
    },
    {
      id: 12,
      name: "Termin Rangka",
      cumulativePercent: 70,
      targetAmount: 700_000,
      termAmount: 400_000,
      fulfilledAmount: 300_000,
      dueDate: new Date("2026-10-10T00:00:00.000Z"),
      milestoneLabel: null,
      sortOrder: 1,
      status: "jatuh_tempo",
      statusLabel: "Jatuh Tempo",
      overdue: true,
    },
    {
      id: 13,
      name: "Pelunasan",
      cumulativePercent: 100,
      targetAmount: 1_000_000,
      termAmount: 300_000,
      fulfilledAmount: 300_000,
      dueDate: new Date("2026-12-01T00:00:00.000Z"),
      milestoneLabel: null,
      sortOrder: 2,
      status: "belum_jatuh_tempo",
      statusLabel: "Belum Jatuh Tempo",
      overdue: false,
    },
  ],
}

afterEach(() => {
  vi.clearAllMocks()
  document.body.replaceChildren()
})

describe("JobPaymentScheduleCard F-2026-10-22-067-S (AC-TM67-6)", () => {
  it("render jadwal server apa adanya: label kesepakatan, nama, persen+nominal, dueDate, status persis", () => {
    const { container, root } = render(<JobPaymentScheduleCard schedule={schedule} quotationId={9} canManage />)
    const block = container.querySelector('[aria-label="Jadwal termin"]')
    expect(block).not.toBeNull()
    const text = block?.textContent ?? ""
    expect(text).toContain("Jadwal kesepakatan")
    expect(text).toContain("DP Awal")
    expect(text).toContain("Termin Rangka")
    expect(text).toContain("Pelunasan")
    expect(text).toContain("30,0%")
    expect(text).toContain("Rp 300.000")
    expect(text).toContain("70,0%")
    expect(text).toContain("Rp 700.000")
    expect(text).toContain("Terpenuhi")
    expect(text).toContain("Jatuh Tempo")
    expect(text).toContain("Belum Jatuh Tempo")
    expect(text).toContain("Terlambat")
    expect(text).toContain("Termin berikutnya")
    unmountCard(root)
    container.remove()
  })

  it("tanpa jadwal: teks belum ada jadwal; dengan izin kelola tombol buat tampil", () => {
    const { container, root } = render(<JobPaymentScheduleCard schedule={null} quotationId={9} canManage />)
    const text = container.textContent ?? ""
    expect(text).toContain("Belum ada jadwal termin untuk penawaran ini.")
    expect(text).not.toContain("Jadwal kesepakatan")
    expect(container.querySelector("button")?.textContent).toContain("+ Jadwal Termin")
    unmountCard(root)
    container.remove()
  })
})

describe("JobPaymentScheduleCard F-2026-10-22-067-S (AC-TM67-7 baca-saja)", () => {
  it("tanpa izin kelola: jadwal tampil, nol tombol kelola, penjelasan hanya baca", () => {
    const { container, root } = render(<JobPaymentScheduleCard schedule={schedule} quotationId={9} canManage={false} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Jadwal kesepakatan")
    expect(text).toContain("Hanya baca: kelola jadwal memerlukan izin edit_quotations.")
    const buttons = [...container.querySelectorAll("button")].map((b) => b.textContent ?? "")
    expect(buttons.join(" ")).not.toContain("Ubah Jadwal")
    expect(buttons.join(" ")).not.toContain("Batalkan Jadwal")
    expect(buttons.join(" ")).not.toContain("+ Jadwal Termin")
    unmountCard(root)
    container.remove()
  })

  it("tanpa izin + tanpa jadwal: nol tombol buat, penjelasan hanya baca", () => {
    const { container, root } = render(<JobPaymentScheduleCard schedule={null} quotationId={9} canManage={false} />)
    expect(container.textContent).toContain("Hanya baca: kelola jadwal memerlukan izin edit_quotations.")
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
    container.remove()
  })
})

describe("JobPaymentScheduleCard F-2026-10-22-067-S (AC-TM67-8 kandidat berikutnya)", () => {
  it("klik termin berikutnya memanggil createProgressInvoice existing dengan persen termin itu", async () => {
    createProgressInvoice.mockResolvedValue({ success: true, id: 99, slug: "inv-2026-0099" })
    const { container, root } = render(<JobPaymentScheduleCard schedule={schedule} quotationId={9} canManage />)
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Buat faktur progres termin Termin Rangka"]')!
    expect(button).not.toBeNull()
    await act(async () => {
      button.click()
    })
    expect(createProgressInvoice).toHaveBeenCalledTimes(1)
    expect(createProgressInvoice).toHaveBeenCalledWith(9, 70)
    expect(showSuccess).toHaveBeenCalledWith("Faktur progres dibuat")
    expect(push).toHaveBeenCalledWith("/penjualan/faktur/inv-2026-0099")
    unmountCard(root)
    container.remove()
  })

  it("error server progres tampil apa adanya tanpa navigasi", async () => {
    createProgressInvoice.mockResolvedValue({ success: false, error: "Target progres sudah tertagih penuh" })
    const { container, root } = render(<JobPaymentScheduleCard schedule={schedule} quotationId={9} canManage />)
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Buat faktur progres termin Termin Rangka"]')!
    await act(async () => {
      button.click()
    })
    expect(showError).toHaveBeenCalledWith("Target progres sudah tertagih penuh")
    expect(showSuccess).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    unmountCard(root)
    container.remove()
  })

  it("semua terpenuhi: teks selesai, tombol progres tidak tampil", () => {
    const done: JobPaymentScheduleResult = { ...schedule, nextTermId: null, allFulfilled: true }
    const { container, root } = render(<JobPaymentScheduleCard schedule={done} quotationId={9} canManage />)
    expect(container.textContent).toContain("Semua termin terpenuhi.")
    expect(container.querySelector('button[aria-label^="Buat faktur progres termin"]')).toBeNull()
    unmountCard(root)
    container.remove()
  })
})

describe("JobPaymentScheduleCard F-2026-10-22-067-S kelola (izin edit_quotations)", () => {
  it("buat jadwal: kirim baris termin ke createJobPaymentSchedule", async () => {
    createJobPaymentSchedule.mockResolvedValue({ success: true, id: 5 })
    const { container, root } = render(<JobPaymentScheduleCard schedule={null} quotationId={9} canManage />)
    await act(async () => {
      clickButtonByText(container, "+ Jadwal Termin")
    })
    await act(async () => {
      setFieldValue(container, 'input[aria-label="Nama termin 1"]', "DP Awal")
      setFieldValue(container, 'input[aria-label="Persen kumulatif termin 1"]', "100")
      setFieldValue(container, 'input[aria-label="Tanggal jatuh tempo termin 1"]', "2026-11-01")
    })
    await act(async () => {
      clickButtonByText(container, "Buat Jadwal")
    })
    expect(createJobPaymentSchedule).toHaveBeenCalledWith({
      quotationId: 9,
      terms: [{ name: "DP Awal", cumulativePercent: 100, dueDate: "2026-11-01", milestoneLabel: null }],
    })
    expect(showSuccess).toHaveBeenCalledWith("Jadwal termin dibuat")
    unmountCard(root)
    container.remove()
  })

  it("ubah jadwal sesudah termin terpenuhi: alasan wajib tampil + terkirim ke update", async () => {
    updateJobPaymentScheduleTerms.mockResolvedValue({ success: true, id: 3 })
    const { container, root } = render(<JobPaymentScheduleCard schedule={schedule} quotationId={9} canManage />)
    await act(async () => {
      clickButtonByText(container, "Ubah Jadwal")
    })
    expect(container.textContent).toContain("Wajib sesudah ada termin terpenuhi.")
    const reason = container.querySelector<HTMLTextAreaElement>("#jadwal-termin-reason")!
    expect(reason.required).toBe(true)
    await act(async () => {
      setFieldValue(container, "#jadwal-termin-reason", "Geser termin rangka")
    })
    await act(async () => {
      clickButtonByText(container, "Simpan Jadwal")
    })
    expect(updateJobPaymentScheduleTerms).toHaveBeenCalledTimes(1)
    const arg = updateJobPaymentScheduleTerms.mock.calls[0][0]
    expect(arg.scheduleId).toBe(3)
    expect(arg.reason).toBe("Geser termin rangka")
    expect(arg.terms).toHaveLength(3)
    expect(arg.terms[0]).toMatchObject({ name: "DP Awal", cumulativePercent: 30 })
    unmountCard(root)
    container.remove()
  })

  it("batalkan jadwal: alasan wajib, tombol nonaktif tanpa alasan, kirim ke cancel", async () => {
    cancelJobPaymentSchedule.mockResolvedValue({ success: true, id: 3 })
    const { container, root } = render(<JobPaymentScheduleCard schedule={schedule} quotationId={9} canManage />)
    await act(async () => {
      clickButtonByText(container, "Batalkan Jadwal")
    })
    const confirm = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Batalkan Jadwal").at(-1)!
    expect(confirm.disabled).toBe(true)
    const reasonEl = setFieldValue(container, "#jadwal-termin-cancel-reason", "Kesepakatan dibatalkan pelanggan")
    expect(reasonEl).not.toBeNull()
    expect(confirm.disabled).toBe(false)
    await act(async () => {
      confirm.click()
    })
    expect(cancelJobPaymentSchedule).toHaveBeenCalledWith({ scheduleId: 3, reason: "Kesepakatan dibatalkan pelanggan" })
    expect(showSuccess).toHaveBeenCalledWith("Jadwal termin dibatalkan")
    unmountCard(root)
    container.remove()
  })

  it("error server kelola tampil apa adanya", async () => {
    createJobPaymentSchedule.mockResolvedValue({
      success: false,
      error: "Penawaran ini sudah memiliki jadwal termin aktif; ubah jadwal yang ada",
    })
    const { container, root } = render(<JobPaymentScheduleCard schedule={null} quotationId={9} canManage />)
    await act(async () => {
      clickButtonByText(container, "+ Jadwal Termin")
    })
    await act(async () => {
      setFieldValue(container, 'input[aria-label="Nama termin 1"]', "DP")
      setFieldValue(container, 'input[aria-label="Persen kumulatif termin 1"]', "100")
      setFieldValue(container, 'input[aria-label="Tanggal jatuh tempo termin 1"]', "2026-11-01")
    })
    await act(async () => {
      clickButtonByText(container, "Buat Jadwal")
    })
    expect(showError).toHaveBeenCalledWith("Penawaran ini sudah memiliki jadwal termin aktif; ubah jadwal yang ada")
    expect(showSuccess).not.toHaveBeenCalled()
    unmountCard(root)
    container.remove()
  })
})
