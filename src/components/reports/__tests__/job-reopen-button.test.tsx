// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/manufacturing.actions", () => ({
  reopenWorkOrder: vi.fn(async () => ({ success: true })),
  reopenProductionOrder: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({ showError: vi.fn(), showSuccess: vi.fn() }))

import { JobReopenButton } from "../job-reopen-button"
import { reopenProductionOrder, reopenWorkOrder } from "@/actions/manufacturing.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { renderCard, unmountCard, clearRenderedCards, setFieldValue } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
  vi.clearAllMocks()
})

function openDialog(container: HTMLElement, label: string) {
  const btn = container.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null
  expect(btn).not.toBeNull()
  act(() => {
    btn!.click()
  })
}

describe("JobReopenButton F-2026-10-21-009-V (UI reopen job closed)", () => {
  it("tombol hanya tampil untuk job closed dengan izin; selain itu kosong", () => {
    const closed = renderCard(
      <JobReopenButton kind="work_order" id={7} code="WO-0007" status="closed" canReopen />,
    )
    expect(closed.container.querySelector('[aria-label="Buka Kembali Job WO-0007"]')).not.toBeNull()
    unmountCard(closed.root)

    for (const node of [
      <JobReopenButton key="completed" kind="work_order" id={7} code="WO-0007" status="completed" canReopen />,
      <JobReopenButton key="tanpa-izin" kind="work_order" id={7} code="WO-0007" status="closed" canReopen={false} />,
      <JobReopenButton key="in-progress" kind="production_order" id={9} code="PO-0009" status="in_progress" canReopen />,
    ]) {
      const r = renderCard(node)
      expect(r.container.textContent ?? "").not.toContain("Buka Kembali")
      unmountCard(r.root)
    }
  })

  it.each([
    {
      kind: "work_order" as const,
      id: 7,
      code: "WO-0007",
      rawReason: "  Ada tagihan subkontrak telat  ",
      trimmedReason: "Ada tagihan subkontrak telat",
    },
    {
      kind: "production_order" as const,
      id: 9,
      code: "PO-0009",
      rawReason: "  Koreksi biaya produksi  ",
      trimmedReason: "Koreksi biaya produksi",
    },
  ])("konfirmasi $kind: aksi kind sendiri 1x (id, alasan trim), aksi lawan 0x", async (c) => {
    const { container, root } = renderCard(
      <JobReopenButton kind={c.kind} id={c.id} code={c.code} status="closed" canReopen />,
    )
    openDialog(container, `Buka Kembali Job ${c.code}`)
    await vi.waitFor(() => {
      expect(document.body.querySelector(`#reopen-reason-${c.kind}-${c.id}`)).not.toBeNull()
    })
    act(() => {
      setFieldValue(document.body, `#reopen-reason-${c.kind}-${c.id}`, c.rawReason)
    })
    const confirm = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Ya, Buka Kembali",
    )
    expect(confirm).toBeDefined()
    act(() => {
      confirm!.click()
    })
    const own = c.kind === "work_order" ? reopenWorkOrder : reopenProductionOrder
    const other = c.kind === "work_order" ? reopenProductionOrder : reopenWorkOrder
    await vi.waitFor(() => {
      expect(own).toHaveBeenCalledTimes(1)
    })
    expect(own).toHaveBeenCalledWith(c.id, c.trimmedReason)
    expect(other).not.toHaveBeenCalled()
    expect(showSuccess).toHaveBeenCalledWith("Job dibuka kembali. Status kini Selesai.")
    unmountCard(root)
  })

  it("alasan kosong/spasi ditolak di UI: aksi server tidak dipanggil", async () => {
    const { container, root } = renderCard(
      <JobReopenButton kind="work_order" id={7} code="WO-0007" status="closed" canReopen />,
    )
    openDialog(container, "Buka Kembali Job WO-0007")
    await vi.waitFor(() => {
      expect(document.body.querySelector("#reopen-reason-work_order-7")).not.toBeNull()
    })
    act(() => {
      setFieldValue(document.body, "#reopen-reason-work_order-7", "   ")
    })
    const confirm = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Ya, Buka Kembali",
    )
    act(() => {
      confirm!.click()
    })
    expect(reopenWorkOrder).not.toHaveBeenCalled()
    expect(reopenProductionOrder).not.toHaveBeenCalled()
    expect(showError).toHaveBeenCalledWith(
      "Alasan reopen wajib diisi (tidak boleh kosong/spasi).",
    )
    unmountCard(root)
  })

  it("error server tampil verbatim lewat toast", async () => {
    vi.mocked(reopenWorkOrder).mockResolvedValueOnce({
      success: false,
      error: "Perintah kerja hanya dapat dibuka kembali dari status 'closed' (saat ini 'completed').",
    })
    const { container, root } = renderCard(
      <JobReopenButton kind="work_order" id={7} code="WO-0007" status="closed" canReopen />,
    )
    openDialog(container, "Buka Kembali Job WO-0007")
    await vi.waitFor(() => {
      expect(document.body.querySelector("#reopen-reason-work_order-7")).not.toBeNull()
    })
    act(() => {
      setFieldValue(document.body, "#reopen-reason-work_order-7", "Biaya telat")
    })
    const confirm = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Ya, Buka Kembali",
    )
    act(() => {
      confirm!.click()
    })
    await vi.waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Perintah kerja hanya dapat dibuka kembali dari status 'closed' (saat ini 'completed').",
      )
    })
    unmountCard(root)
  })
})
