// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView ??= () => {}

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const linkMock = vi.fn(async () => ({ success: true }))
const transitionMock = vi.fn(async () => ({ success: true }))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))
vi.mock("@/actions/warranty.actions", () => ({
  linkSupplierClaimAction: (...a: unknown[]) => linkMock(...(a as [])),
  transitionSupplierClaimAction: (...a: unknown[]) => transitionMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

import {
  WarrantySupplierClaimPanel,
  type SupplierClaimFacts,
} from "../warranty-supplier-claim-panel"

const facts = (over: Partial<SupplierClaimFacts> = {}): SupplierClaimFacts => ({
  claimId: 5,
  claimStatus: "closed",
  resolutionType: "replace",
  supplierClaimStatus: "none",
  vendorName: null,
  purchaseReturnLabel: null,
  supplierClaimRefNo: null,
  supplierClaimNotes: null,
  supplierClaimByName: null,
  supplierClaimAt: null,
  attachmentCount: 0,
  ...over,
})

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

const vendors = [{ value: "3", label: "PT Sumber Part" }]
const returns = [{ value: "8", label: "RTB-001 — PT Sumber Part" }]

describe("WarrantySupplierClaimPanel — recovery terpisah dari klaim pelanggan", () => {
  it("status none + klaim closed beresolusi replace: form tautan tampil, status recovery belum ditautkan", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts()}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={true}
        canApprove={false}
      />,
    )
    expect(container.textContent).toContain("Belum ditautkan")
    expect(container.textContent).toContain("terpisah dari status klaim pelanggan")
    expect(container.querySelector("[aria-label='Formulir tautan klaim supplier']")).not.toBeNull()
    expect(container.textContent).toContain("Tanpa retur — jalur vendor saja")
    act(() => root.unmount())
  })

  it("klaim belum disetujui / bukan replace: form tautan tidak tampil, alasan tampil", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({ claimStatus: "eligibility", resolutionType: null })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={true}
        canApprove={false}
      />,
    )
    expect(container.querySelector("[aria-label='Formulir tautan klaim supplier']")).toBeNull()
    expect(container.textContent).toContain("hanya bisa dibuat sesudah klaim garansi disetujui")
    act(() => root.unmount())
  })

  it("tanpa izin edit form tautan dan status tidak tampil; data recovery tetap terbaca", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({
          supplierClaimStatus: "drafted",
          vendorName: "PT Sumber Part",
          supplierClaimRefNo: "RESI-123",
          supplierClaimByName: "Bima",
          supplierClaimAt: "21 Oktober 2026, 10.00",
        })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={false}
        canApprove={false}
      />,
    )
    expect(container.textContent).toContain("Draf klaim supplier")
    expect(container.textContent).toContain("PT Sumber Part")
    expect(container.textContent).toContain("RESI-123")
    expect(container.querySelector("[aria-label='Formulir status klaim supplier']")).toBeNull()
    act(() => root.unmount())
  })

  it("drafted + edit saja: Kirim tidak ditawarkan (butuh approve), Lepas Tautan ditawarkan", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({ supplierClaimStatus: "drafted", vendorName: "PT Sumber Part" })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={true}
        canApprove={false}
      />,
    )
    const combobox = container.querySelector<HTMLElement>("[aria-label='Langkah klaim supplier berikutnya']")
    expect(combobox).not.toBeNull()
    act(() => {
      combobox?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
      combobox?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }))
      combobox?.click()
    })
    expect(document.body.textContent).toContain("Lepas Tautan")
    expect(document.body.textContent).not.toContain("Kirim ke Supplier")
    act(() => root.unmount())
  })

  it("drafted + approve: Kirim ditawarkan dan syarat foto + resi dinyatakan", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({
          supplierClaimStatus: "drafted",
          vendorName: "PT Sumber Part",
          attachmentCount: 2,
        })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={true}
        canApprove={true}
      />,
    )
    expect(container.textContent).toContain("2 lampiran tercatat")
    expect(container.textContent).toContain("Kirim klaim supplier butuh izin persetujuan")
    act(() => root.unmount())
  })

  it("transisi terkonfirmasi (tutup tanpa recovery) membawa refNo + catatan dari form, bukan dibuang", async () => {
    transitionMock.mockClear()
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({ supplierClaimStatus: "rejected_supplier", vendorName: "PT Sumber Part" })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={true}
        canApprove={true}
      />,
    )
    const combobox = container.querySelector<HTMLElement>("[aria-label='Langkah klaim supplier berikutnya']")!
    act(() => {
      combobox.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
      combobox.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }))
      combobox.click()
    })
    const option = Array.from(document.body.querySelectorAll<HTMLElement>("[cmdk-item]"))
      .find((el) => el.textContent?.includes("Tanpa Recovery"))
    expect(option).toBeDefined()
    act(() => option!.click())
    const refInput = container.querySelector<HTMLInputElement>("#supplierClaimRefNoTransition")!
    const notesInput = container.querySelector<HTMLTextAreaElement>("#supplierClaimNotesTransition")!
    const setVal = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v)
      el.dispatchEvent(new Event("input", { bubbles: true }))
    }
    act(() => { setVal(refInput, "REF-9"); setVal(notesInput, "supplier menolak, tanpa pengganti") })
    const danger = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Tutup Tanpa Recovery"))!
    act(() => danger.click())
    const confirmBtn = Array.from(document.body.querySelectorAll<HTMLElement>("[role='alertdialog'] button")).find((b) => b.textContent?.trim() === "Tutup — Tanpa Recovery")
    expect(confirmBtn).toBeDefined()
    await act(async () => { confirmBtn!.click() })
    expect(transitionMock).toHaveBeenCalledTimes(1)
    const fd = (transitionMock.mock.calls as unknown as [FormData][])[0][0]
    expect(fd.get("to")).toBe("closed_no_recovery")
    expect(fd.get("claimId")).toBe("5")
    expect(fd.get("supplierClaimRefNo")).toBe("REF-9")
    expect(fd.get("supplierClaimNotes")).toBe("supplier menolak, tanpa pengganti")
    act(() => root.unmount())
  })

  it("status terminal: tidak ada form transisi, label tutup tampil", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({ supplierClaimStatus: "closed_no_recovery" })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={true}
        canApprove={true}
      />,
    )
    expect(container.textContent).toContain("Tutup — tanpa recovery")
    expect(container.querySelector("[aria-label='Formulir status klaim supplier']")).toBeNull()
    act(() => root.unmount())
  })

  it("E130-1: label refNo netral — tidak mengesankan resi = persetujuan; accepted = persetujuan vendor", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({ supplierClaimStatus: "sent", vendorName: "PT Sumber Part" })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={true}
        canApprove={true}
      />,
    )
    expect(container.textContent).toContain("Nomor Referensi Klaim Supplier")
    expect(container.textContent).not.toContain("Nomor Referensi / Resi")
    const combobox = container.querySelector<HTMLElement>("[aria-label='Langkah klaim supplier berikutnya']")!
    act(() => {
      combobox.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
      combobox.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }))
      combobox.click()
    })
    const option = Array.from(document.body.querySelectorAll<HTMLElement>("[cmdk-item]")).find((el) =>
      el.textContent?.includes("Diterima Supplier"),
    )
    expect(option).toBeDefined()
    act(() => option!.click())
    const label = container.querySelector<HTMLLabelElement>("label[for='supplierClaimRefNoTransition']")
    expect(label?.textContent).toContain("Nomor Referensi Persetujuan Vendor")
    expect(container.textContent).toContain("Nomor resi pengiriman bukan referensi persetujuan vendor")
    const input = container.querySelector<HTMLInputElement>("#supplierClaimRefNoTransition")!
    expect(input.placeholder).toContain("bukan nomor resi pengiriman")
    act(() => root.unmount())
  })

  it("E130-1: penanda resi di Catatan Klaim Supplier diberi penjelasan bukan persetujuan", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({
          supplierClaimStatus: "sent",
          vendorName: "PT Sumber Part",
          supplierClaimNotes: "Kirim via ekspedisi\n[Resi pengiriman klaim supplier: RESI-77]",
        })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={false}
        canApprove={false}
      />,
    )
    expect(container.textContent).toContain("[Resi pengiriman klaim supplier: RESI-77]")
    expect(container.textContent).toContain(
      "mencatat nomor resi pengiriman, bukan nomor referensi persetujuan vendor",
    )
    act(() => root.unmount())
  })

  it("refNo kosong dinyatakan eksplisit, bukan nilai kosong", () => {
    const { container, root } = mount(
      <WarrantySupplierClaimPanel
        facts={facts({ supplierClaimStatus: "sent", vendorName: "PT Sumber Part" })}
        vendorOptions={vendors}
        purchaseReturnOptions={returns}
        canLink={true}
        canApprove={true}
      />,
    )
    expect(container.textContent).toContain("Belum ada nomor referensi tercatat")
    expect(container.textContent).toContain("Terkirim ke supplier")
    act(() => root.unmount())
  })
})
