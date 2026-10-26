// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { act } from "react"

import { CustomerCommissionRates, type CommissionRateRow } from "../customer-commission-rates"
import {
  mountInto, unmount, withContainer, toastModule,
} from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)

const createRate = vi.fn()
const updateRate = vi.fn()
const deleteRate = vi.fn()
vi.mock("@/actions/master.actions", () => ({
  createCustomerCommissionRate: (...args: unknown[]) => createRate(...args),
  updateCustomerCommissionRate: (...args: unknown[]) => updateRate(...args),
  deleteCustomerCommissionRate: (...args: unknown[]) => deleteRate(...args),
}))

const RATES: CommissionRateRow[] = [
  { id: 11, commissionPercent: 2.5, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: "2026-06-30T00:00:00.000Z" },
  { id: 12, commissionPercent: 3, effectiveFrom: "2026-07-01T00:00:00.000Z", effectiveTo: null },
]

async function withContainerAsync(run: (container: HTMLElement) => Promise<void>) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  await run(container)
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

afterEach(() => {
  vi.clearAllMocks()
  document.body.replaceChildren()
})

describe("CustomerCommissionRates F-2026-10-25-036-S (UI)", () => {
  it("AC-KT-F1: histori verbatim tampil; tanpa izin tidak ada form/aksi", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <CustomerCommissionRates customerCategoryId={7} rates={RATES} canCreate={false} canEdit={false} />,
      )
      const text = container.textContent ?? ""
      expect(text).toContain("Tarif Komisi per Kategori Pelanggan")
      expect(text).toContain("2,50%")
      expect(text).toContain("3,00%")
      expect(text).toContain("1 Januari 2026")
      expect(text).toContain("30 Juni 2026")
      expect(text).toContain("Masih berlaku")
      expect(text).toContain("baris lama tidak ditimpa")
      // Tanpa izin: tidak ada form tambah maupun aksi ubah/hapus (AC-KT-F4 UX).
      expect(container.querySelector("form")).toBeNull()
      expect(container.querySelectorAll("button")).toHaveLength(0)
      unmount(root, container)
    })
  })

  it("kosong: teks belum ada tarif, form tambah tetap tampil bila berizin + label terikat", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <CustomerCommissionRates customerCategoryId={7} rates={[]} canCreate canEdit={false} />,
      )
      expect(container.textContent ?? "").toContain("Belum ada tarif komisi tercatat untuk kategori ini.")
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah tarif komisi kategori pelanggan")
      expect(container.querySelector('label[for="commissionPercent"]')).not.toBeNull()
      expect(container.querySelector('label[for="effectiveFrom"]')).not.toBeNull()
      expect(container.querySelector('label[for="effectiveTo"]')).not.toBeNull()
      unmount(root, container)
    })
  })

  it("AC-KT-F1: submit tambah memanggil create dengan kategori dari prop + error server verbatim", async () => {
    createRate.mockResolvedValue({ success: false, error: "Masa tarif tumpang tindih dengan baris lain" })
    await withContainerAsync(async (container) => {
      const root = mountInto(
        container,
        <CustomerCommissionRates customerCategoryId={7} rates={[]} canCreate canEdit={false} />,
      )
      const form = container.querySelector("form")!
      container.querySelector<HTMLInputElement>("#commissionPercent")!.value = "4"
      container.querySelector<HTMLInputElement>("#effectiveFrom")!.value = "2026-08-01"
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })
      expect(createRate).toHaveBeenCalledTimes(1)
      const formData = createRate.mock.calls[0][0] as FormData
      expect(formData.get("customerCategoryId")).toBe("7")
      expect(formData.get("commissionPercent")).toBe("4")
      expect(formData.get("effectiveFrom")).toBe("2026-08-01")
      expect(toastModule.showError).toHaveBeenCalledWith("Masa tarif tumpang tindih dengan baris lain")
      unmount(root, container)
    })
  })

  it("tutup masa: update membawa persen + mulai baris itu sendiri (server menjaga snapshot)", async () => {
    updateRate.mockResolvedValue({ success: true })
    await withContainerAsync(async (container) => {
      const root = mountInto(
        container,
        <CustomerCommissionRates customerCategoryId={7} rates={RATES} canCreate={false} canEdit />,
      )
      const closeInput = container.querySelector<HTMLInputElement>("#commission-close-12")!
      await act(async () => {
        setInputValue(closeInput, "2026-12-31")
      })
      const closeButtons = Array.from(container.querySelectorAll("button")).filter(
        (b) => b.textContent === "Tutup Masa",
      )
      await act(async () => {
        closeButtons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
      expect(updateRate).toHaveBeenCalledTimes(1)
      expect(updateRate.mock.calls[0][0]).toBe(12)
      const formData = updateRate.mock.calls[0][1] as FormData
      expect(formData.get("commissionPercent")).toBe("3")
      expect(formData.get("effectiveTo")).toBe("2026-12-31")
      expect(toastModule.showSuccess).toHaveBeenCalledWith("Masa tarif komisi ditutup")
      unmount(root, container)
    })
  })

  it("hapus: konfirmasi dulu, lalu delete dipanggil dengan id baris", async () => {
    deleteRate.mockResolvedValue({ success: true })
    await withContainerAsync(async (container) => {
      const root = mountInto(
        container,
        <CustomerCommissionRates customerCategoryId={7} rates={RATES} canCreate={false} canEdit />,
      )
      const deleteButton = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Hapus tarif komisi berlaku mulai 1 Juli 2026"]',
      )!
      await act(async () => {
        deleteButton.click()
      })
      expect(deleteRate).not.toHaveBeenCalled()
      const confirmButton = document.querySelector<HTMLButtonElement>(
        '[data-slot="alert-dialog-action"]',
      )!
      await act(async () => {
        confirmButton.click()
      })
      expect(deleteRate).toHaveBeenCalledWith(12)
      unmount(root, container)
    })
  })
})
