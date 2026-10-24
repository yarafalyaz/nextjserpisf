// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { act } from "react"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { VendorBillForm } from "../vendor-bill-form"
import {
  assertFormEditLabel,
  decorativeStars,
  labelTexts,
  mountInto,
  unmount,
  withContainer,
} from "./form-a11y-test-utils"
import { toastModule, setFieldValue } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)

const createVendorBillMock = vi.fn().mockResolvedValue({ success: true })
vi.mock("@/actions/purchase.actions", () => ({
  createVendorBill: (...args: unknown[]) => createVendorBillMock(...args),
  updateVendorBill: vi.fn().mockResolvedValue({ success: true }),
}))

// QuickAddSelect resolves its target via the registry, which statically imports
// server actions (next-auth/next-server). Stub it so this unit test stays pure.
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)

const vendors = [{ id: 1, name: "Pemasok A" }]
const items = [{ id: 7, sku: "SKU-7", name: "Baut M8", cost: 1000, unitOfMeasure: "pcs" }]

describe("vendor-bill-form — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, Pemasok bintang dekoratif + wajib, opsional bersih", () => {
    withContainer((container) => {
      const root = mountInto(container, <VendorBillForm vendors={vendors} items={items} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah tagihan pemasok")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Pemasok *", "PO Terkait", "Jenis PPh"]))
      expect(container.querySelector("#vendorId")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#purchaseOrderId")!.getAttribute("aria-required")).not.toBe("true")
      expect(container.querySelector("#date-trigger")!.getAttribute("aria-required")).toBe("true")
      unmount(root, container)
    })
  })

  it("ubah: aria-label ubah tagihan pemasok", () => {
    const bill = { id: 9, vendorId: 1, date: "2026-10-22" }
    withContainer((container) => {
      const root = mountInto(container, <VendorBillForm vendors={vendors} items={items} bill={bill} />)
      assertFormEditLabel(container, "Formulir ubah tagihan pemasok")
      unmount(root, container)
    })
  })

  it("L3: centang + isi WO/alasan menulis frasa persis ke notes; edit notes bertanda membaca balik terstruktur", () => {
    withContainer((container) => {
      const root = mountInto(container, <VendorBillForm vendors={vendors} items={items} />)
      const toggle = container.querySelector<HTMLInputElement>("#notes-l3-enabled")!
      expect(toggle.checked).toBe(false)
      act(() => { toggle.click() })
      const wo = container.querySelector<HTMLInputElement>("#notes-l3-work-order-no")!
      const reason = container.querySelector<HTMLTextAreaElement>("#notes-l3-reason")!
      expect(container.textContent).toContain("bukan biaya job")
      act(() => setFieldValue(wo, "WO-0007"))
      act(() => setFieldValue(reason, "Denda keterlambatan supplier"))
      expect(container.querySelector<HTMLTextAreaElement>("#notes")!.value).toBe(
        "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: Denda keterlambatan supplier",
      )
      act(() => { toggle.click() })
      expect(container.querySelector<HTMLTextAreaElement>("#notes")!.value).toBe("")
      unmount(root, container)
    })
    withContainer((container) => {
      const bill = {
        id: 9, vendorId: 1, date: "2026-10-22",
        notes: "BIAYA TELAT NON-JOB L3 | WO: WO-0009 | Alasan: Biaya parkir susulan\ncatatan operator",
      }
      const root = mountInto(container, <VendorBillForm vendors={vendors} items={items} bill={bill} />)
      expect(container.querySelector<HTMLInputElement>("#notes-l3-enabled")!.checked).toBe(true)
      expect(container.querySelector<HTMLInputElement>("#notes-l3-work-order-no")!.value).toBe("WO-0009")
      expect(container.querySelector<HTMLTextAreaElement>("#notes-l3-reason")!.value).toBe("Biaya parkir susulan")
      unmount(root, container)
    })
  })

  it("L3: error server tampil verbatim lewat showError saat submit", async () => {
    const serverError = "Jalur L3 hanya untuk biaya telat sesudah perintah kerja ditutup; WO-0007 berstatus 'open' (bukan closed). Biaya untuk WO yang belum ditutup dicatat lewat jalur biaya job biasa."
    createVendorBillMock.mockResolvedValueOnce({ success: false, error: serverError })
    vi.mocked(toastModule.showError).mockClear()
    withContainer((container) => {
      const root = mountInto(container, <VendorBillForm vendors={vendors} items={items} />)
      act(() => {
        container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })
      unmount(root, container)
    })
    await act(async () => {})
    expect(createVendorBillMock).toHaveBeenCalledTimes(1)
    expect(toastModule.showError).toHaveBeenCalledWith(serverError)
  })
})
