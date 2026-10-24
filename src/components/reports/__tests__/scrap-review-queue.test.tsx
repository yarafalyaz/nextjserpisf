// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

const reviewMock = vi.fn(async (..._args: unknown[]) => ({ success: true as const }))
vi.mock("@/actions/inventory.actions", () => ({
  reviewAbnormalScrap: (...args: unknown[]) => reviewMock(...args),
}))

vi.mock("@/lib/utils/toast", () => ({ showError: vi.fn(), showSuccess: vi.fn() }))

import {
  ScrapReviewQueue,
  isScrapReviewSubmitDisabled,
  type ScrapReviewQueueRow,
} from "../scrap-review-queue"
import { renderCard, unmountCard, clickButtonByText } from "./card-test-utils"
import { act } from "react"

const row: ScrapReviewQueueRow = {
  source: "MI",
  lineId: 5,
  documentNo: "MI-001",
  date: new Date("2026-10-24T00:00:00Z"),
  itemName: "Plat 3mm",
  abnormalQty: 2.5,
  abnormalValue: 150000,
  scrapReasonLabel: "Salah potong",
  allowanceNote: null,
  materialShape: null,
}

beforeEach(() => {
  reviewMock.mockClear()
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("ScrapReviewQueue F-2026-10-24-098-S", () => {
  it("kosong: pesan tidak ada menunggu tinjau", () => {
    const html = renderToStaticMarkup(<ScrapReviewQueue rows={[]} canReview />)
    expect(html).toContain("Tidak ada scrap abnormal menunggu tinjau pada periode ini")
    expect(html).toContain("0 menunggu tinjau")
  })

  it("baris pending tampil snapshot apa adanya + belum ditetapkan tanpa angka karangan", () => {
    const html = renderToStaticMarkup(<ScrapReviewQueue rows={[row]} canReview />)
    expect(html).toContain("MI MI-001")
    expect(html).toContain("Plat 3mm")
    expect(html).toContain("Abnormal belum ditinjau")
    expect(html).toContain("Salah potong")
    expect(html).toContain("Bentuk bahan:")
    expect(html).toContain("Belum ditetapkan")
    expect(html).toContain("Acuan allowance: Belum ditetapkan")
    expect(html).toContain("Tinjau")
  })

  it("tanpa izin: baca-saja, tombol Tinjau tidak dirender + penjelasan", () => {
    const html = renderToStaticMarkup(<ScrapReviewQueue rows={[row]} canReview={false} />)
    expect(html).toContain("tidak memiliki izin menyelesaikan perintah kerja")
    expect(html).not.toContain(">Tinjau</button>")
    expect(html).not.toContain("Simpan Tinjauan")
  })

  it("klik Tinjau membuka form disposisi (izin ada)", () => {
    const { container, root } = renderCard(<ScrapReviewQueue rows={[row]} canReview />)
    act(() => {
      clickButtonByText(container, "Tinjau")
    })
    expect(container.textContent).toContain("Disposisi tinjau")
    expect(container.textContent).toContain("Catatan tinjau")
    expect(container.querySelector('button[type="button"]')?.textContent ?? "").toBeDefined()
    const simpan = [...container.querySelectorAll("button")].find((b) => b.textContent === "Simpan Tinjauan") as HTMLButtonElement
    expect(simpan).toBeTruthy()
    expect(simpan.disabled).toBe(true)
    unmountCard(root)
  })

  it("gerbang disposisi: kelalaian wajib catatan, diterima_wajar tidak", () => {
    expect(isScrapReviewSubmitDisabled({ isPending: false, disposition: "", note: "" })).toBe(true)
    expect(isScrapReviewSubmitDisabled({ isPending: false, disposition: "kelalaian", note: " " })).toBe(true)
    expect(isScrapReviewSubmitDisabled({ isPending: false, disposition: "kelalaian", note: "teguran" })).toBe(false)
    expect(isScrapReviewSubmitDisabled({ isPending: false, disposition: "diterima_wajar", note: "" })).toBe(false)
    expect(isScrapReviewSubmitDisabled({ isPending: true, disposition: "diterima_wajar", note: "" })).toBe(true)
    expect(isScrapReviewSubmitDisabled({ isPending: false, disposition: "aneh", note: "x" })).toBe(true)
  })
})
