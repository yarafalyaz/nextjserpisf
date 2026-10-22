// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// Radix Checkbox pakai ResizeObserver; jsdom tidak punya (pola form-a11y repo).
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { TransferReceivePanel, TRANSFER_SHORTAGE_WARNING, type TransferReceiveLine } from "../transfer-receive-panel"

const receiveMock = vi.fn().mockResolvedValue({ success: true })
const closeMock = vi.fn().mockResolvedValue({ success: true })

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/inventory.actions", () => ({
  receiveInventoryTransfer: (...args: unknown[]) => receiveMock(...args),
  closeInventoryTransferShortage: (...args: unknown[]) => closeMock(...args),
}))

vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

import { showError } from "@/lib/utils/toast"

function mount(element: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => { root.render(element) })
  return { container, root }
}

function unmount(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}

const plainLine: TransferReceiveLine = {
  transferItemId: 11,
  itemName: "Ban Luar 12R22.5",
  unit: "PCS",
  qty: 10,
  receivedQty: 4,
  remainingQty: 6,
  remainingSerials: [],
  batchAllocations: [],
}

const serialLine: TransferReceiveLine = {
  transferItemId: 12,
  itemName: "ECU Mesin",
  unit: "PCS",
  qty: 5,
  receivedQty: 2,
  remainingQty: 3,
  remainingSerials: ["SN-3", "SN-4", "SN-5"],
  batchAllocations: [],
}

const batchLine: TransferReceiveLine = {
  transferItemId: 13,
  itemName: "Oli Mesin 10W-40",
  unit: "LITER",
  qty: 20,
  receivedQty: 0,
  remainingQty: 20,
  remainingSerials: [],
  batchAllocations: [{ batchNumber: "LOT-A", qty: 20 }],
}

describe("transfer-receive-panel — F-2026-10-22-081-S §6", () => {
  beforeEach(() => {
    receiveMock.mockClear()
    closeMock.mockClear()
    vi.mocked(showError).mockClear()
  })

  it("kolom §6 verbatim + tombol Terima Barang untuk processed, default sisa dari server", () => {
    const { container, root } = mount(
      <TransferReceivePanel transferId={7} status="processed" lines={[plainLine]} canCloseShortage />,
    )
    const headers = Array.from(container.querySelectorAll("th")).map((th) => th.textContent?.trim())
    expect(headers).toEqual(expect.arrayContaining(["Terkirim", "Sudah Diterima", "Belum Diterima", "Diterima Kali Ini"]))
    expect(container.querySelector('button[type="submit"]')?.textContent).toContain("Terima Barang")
    const input = container.querySelector<HTMLInputElement>("#received-qty-11")!
    expect(input.value).toBe("6")
    expect(container.querySelector('label[for="received-qty-11"]')).not.toBeNull()
    unmount(root, container)
  })

  it("status partially_received -> tombol Terima Susulan + Tutup Selisih tampil hanya bila diizinkan", () => {
    const allowed = mount(
      <TransferReceivePanel transferId={7} status="partially_received" lines={[plainLine]} canCloseShortage />,
    )
    expect(allowed.container.querySelector('button[type="submit"]')?.textContent).toContain("Terima Susulan")
    expect(Array.from(allowed.container.querySelectorAll("button")).some((b) => b.textContent?.includes("Tutup Selisih"))).toBe(true)
    unmount(allowed.root, allowed.container)

    const denied = mount(
      <TransferReceivePanel transferId={7} status="partially_received" lines={[plainLine]} canCloseShortage={false} />,
    )
    expect(Array.from(denied.container.querySelectorAll("button")).some((b) => b.textContent?.includes("Tutup Selisih"))).toBe(false)
    unmount(denied.root, denied.container)
  })

  it("submit: payload items JSON + idempotencyKey + hanya baris qty > 0", async () => {
    const zeroLine: TransferReceiveLine = { ...batchLine, transferItemId: 13 }
    const { container, root } = mount(
      <TransferReceivePanel transferId={7} status="partially_received" lines={[plainLine, zeroLine]} canCloseShortage={false} />,
    )
    const batchInput = container.querySelector<HTMLInputElement>("#received-qty-13")!
    act(() => {
      // Baris batch dikosongkan -> tidak ikut payload.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
      setter.call(batchInput, "0")
      batchInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(receiveMock).toHaveBeenCalledTimes(1)
    const [transferId, formData] = receiveMock.mock.calls[0] as [number, FormData]
    expect(transferId).toBe(7)
    expect(String(formData.get("idempotencyKey") ?? "").length).toBeGreaterThanOrEqual(8)
    const items = JSON.parse(String(formData.get("items"))) as { transferItemId: number; qty: number }[]
    expect(items).toEqual([{ transferItemId: 11, qty: 6 }])
    unmount(root, container)
  })

  it("serial: centang serial tiba mengatur qty kali ini + payload memuat serial terpilih", async () => {
    const { container, root } = mount(
      <TransferReceivePanel transferId={7} status="processed" lines={[serialLine]} canCloseShortage={false} />,
    )
    const checkbox = container.querySelector<HTMLElement>("#serial-12-SN-4")!
    await act(async () => { checkbox.click() })
    const qtyInput = container.querySelector<HTMLInputElement>("#received-qty-12")!
    expect(qtyInput.value).toBe("1")
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    const [, formData] = receiveMock.mock.calls[0] as [number, FormData]
    const items = JSON.parse(String(formData.get("items"))) as { serialNumbers?: string[] }[]
    expect(items[0].serialNumbers).toEqual(["SN-4"])
    unmount(root, container)
  })

  it("batch: alokasi lot terisi ikut payload; tanpa alokasi baris batch tetap terkirim apa adanya ke server (penolakan server)", async () => {
    const { container, root } = mount(
      <TransferReceivePanel transferId={7} status="processed" lines={[batchLine]} canCloseShortage={false} />,
    )
    const lotInput = container.querySelector<HTMLInputElement>("#batch-13-LOT-A")!
    expect(container.querySelector('label[for="batch-13-LOT-A"]')).not.toBeNull()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
      setter.call(lotInput, "20")
      lotInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    const [, formData] = receiveMock.mock.calls[0] as [number, FormData]
    const items = JSON.parse(String(formData.get("items"))) as { batchAllocations?: { batchNumber: string; qty: number }[] }[]
    expect(items[0].batchAllocations).toEqual([{ batchNumber: "LOT-A", qty: 20 }])
    unmount(root, container)
  })

  it("error server tampil verbatim lewat showError", async () => {
    receiveMock.mockResolvedValueOnce({ success: false, error: "Qty diterima (9) melebihi sisa belum diterima (6) untuk baris #11." })
    const { container, root } = mount(
      <TransferReceivePanel transferId={7} status="processed" lines={[plainLine]} canCloseShortage={false} />,
    )
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(showError).toHaveBeenCalledWith("Qty diterima (9) melebihi sisa belum diterima (6) untuk baris #11.")
    unmount(root, container)
  })

  it("peringatan tutup selisih verbatim §6", () => {
    expect(TRANSFER_SHORTAGE_WARNING).toBe(
      "Sisa akan dihapus dari persediaan lewat Penyesuaian Stok sesudah disetujui. Barang yang ternyata tiba sesudah ditutup tidak bisa diterima dari transfer ini.",
    )
  })
})
