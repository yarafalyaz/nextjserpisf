// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const removalAction = vi.fn()
const showError = vi.fn()
const showSuccess = vi.fn()
const refresh = vi.fn()

vi.mock("@/actions/warranty.actions", () => ({
  recordInstalledPartRemovalAction: (fd: FormData) => removalAction(fd),
}))
vi.mock("@/lib/utils/toast", () => ({
  showError: (m: string) => showError(m),
  showSuccess: (m: string) => showSuccess(m),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}))

import { InstalledPartRemovalForm } from "../installed-part-removal-form"

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

async function submit(container: HTMLDivElement) {
  const form = container.querySelector("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

// Penjaga form catat-lepas F-072-S: error server tampil verbatim lewat toast,
// sukses menutup form + refresh panel; field sesuai kontrak aksi BOT 3.
describe("InstalledPartRemovalForm — kontrak aksi + error verbatim", () => {
  beforeEach(() => {
    removalAction.mockReset()
    showError.mockReset()
    showSuccess.mockReset()
    refresh.mockReset()
  })

  it("submit sukses: FormData kontrak terkirim, form ditutup, panel refresh", async () => {
    removalAction.mockResolvedValue({ success: true, id: 3 })
    const onDone = vi.fn()
    const { container, root } = mount(
      <InstalledPartRemovalForm
        installedPartId={3}
        qtyRemaining={2}
        replacementOptions={[{ id: 8, itemName: "Aki Cadangan", serialNumber: "AKI-SN-9" }]}
        onDone={onDone}
      />,
    )
    setValue(container.querySelector('textarea[name="removalReason"]')!, "Diganti baru")
    await submit(container)

    expect(removalAction).toHaveBeenCalledTimes(1)
    const fd = removalAction.mock.calls[0][0] as FormData
    expect(fd.get("installedPartId")).toBe("3")
    expect(fd.get("qtyRemoved")).toBe("2")
    expect(fd.get("removalReason")).toBe("Diganti baru")
    expect(showSuccess).toHaveBeenCalledWith("Lepas part terpasang berhasil dicatat")
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(showError).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("error server tampil verbatim; form tetap terbuka", async () => {
    removalAction.mockResolvedValue({
      success: false,
      error: "Jumlah dilepas melebihi sisa part terpasang",
    })
    const onDone = vi.fn()
    const { container, root } = mount(
      <InstalledPartRemovalForm
        installedPartId={3}
        qtyRemaining={1}
        replacementOptions={[]}
        onDone={onDone}
      />,
    )
    setValue(container.querySelector('textarea[name="removalReason"]')!, "Rusak")
    await submit(container)

    expect(showError).toHaveBeenCalledWith("Jumlah dilepas melebihi sisa part terpasang")
    expect(onDone).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("label terikat htmlFor + alasan wajib", () => {
    const { container, root } = mount(
      <InstalledPartRemovalForm
        installedPartId={5}
        qtyRemaining={1}
        replacementOptions={[]}
        onDone={vi.fn()}
      />,
    )
    const reason = container.querySelector<HTMLTextAreaElement>("#removal-reason-5")!
    expect(reason.required).toBe(true)
    expect(container.querySelector('label[for="removal-reason-5"]')).not.toBeNull()
    expect(container.querySelector('label[for="qty-removed-5"]')).not.toBeNull()
    act(() => root.unmount())
  })

  it("aria-busy false saat diam, true saat submit pending", async () => {
    let resolveAction!: (v: { success: boolean; id: number }) => void
    removalAction.mockReturnValue(
      new Promise((r) => {
        resolveAction = r
      }),
    )
    const { container, root } = mount(
      <InstalledPartRemovalForm
        installedPartId={3}
        qtyRemaining={1}
        replacementOptions={[]}
        onDone={vi.fn()}
      />,
    )
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-busy")).toBe("false")
    setValue(container.querySelector('textarea[name="removalReason"]')!, "Rusak")
    await submit(container)
    expect(form.getAttribute("aria-busy")).toBe("true")
    await act(async () => resolveAction({ success: true, id: 3 }))
    expect(form.getAttribute("aria-busy")).toBe("false")
    act(() => root.unmount())
  })
})
