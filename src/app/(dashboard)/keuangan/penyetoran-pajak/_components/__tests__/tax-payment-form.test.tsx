// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { TaxPaymentForm } from "../tax-payment-form"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/tax-payment.actions", () => ({
  createTaxPayment: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

function mount() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      <TaxPaymentForm
        taxTypes={[{ value: "1", label: "PPh 23" }]}
        liabilityAccounts={[{ value: "2", label: "210202 PPh 23" }]}
        paymentAccounts={[{ value: "3", label: "Bank BCA" }]}
      />,
    )
  })
  return { container, root }
}

describe("tax-payment-form — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, 4 bintang dekoratif, wajib aria-required, opsional bersih", () => {
    const { container, root } = mount()
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah penyetoran pajak")
    expect(form.getAttribute("aria-busy")).toBe("false")
    expect(form.querySelectorAll('span[aria-hidden="true"].text-destructive').length).toBe(4)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(
      expect.arrayContaining(["Jumlah Setor *", "Akun Utang Pajak *", "Dibayar dari Kas/Bank *", "Jenis Pemotongan", "Nomor SSP / MPN", "Keterangan"]),
    )
    for (const id of ["taxAccountId", "paymentAccountId", "date-trigger"]) {
      expect(container.querySelector(`#${id}`)!.getAttribute("aria-required"), id).toBe("true")
    }
    expect(container.querySelector("#taxTypeId")!.getAttribute("aria-required")).not.toBe("true")
    expect(container.querySelector<HTMLInputElement>("#amount")!.hasAttribute("required")).toBe(true)
    expect(container.querySelector<HTMLInputElement>("#reference")!.hasAttribute("required")).toBe(false)
    act(() => root.unmount())
    container.remove()
  })
})
