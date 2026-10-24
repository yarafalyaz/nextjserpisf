// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { MaterialRequestForm } from "../material-request-form"
import { MaterialRequestActions } from "@/app/(dashboard)/inventaris/permintaan-gudang/_components/material-request-actions"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/material-request.actions", () => ({
  createMaterialRequest: vi.fn().mockResolvedValue({ success: true, id: 1, slug: "mrq-1" }),
  updateMaterialRequest: vi.fn().mockResolvedValue({ success: true, id: 1 }),
  submitMaterialRequest: vi.fn().mockResolvedValue({ success: true }),
  approveMaterialRequest: vi.fn().mockResolvedValue({ success: true }),
  rejectMaterialRequest: vi.fn().mockResolvedValue({ success: true }),
  cancelMaterialRequest: vi.fn().mockResolvedValue({ success: true }),
  closeMaterialRequest: vi.fn().mockResolvedValue({ success: true }),
  createTransferFromMaterialRequest: vi.fn().mockResolvedValue({ success: true, id: 2, slug: "trf-1" }),
}))

const warehouses = [
  { id: 1, name: "Gudang Utama" },
  { id: 2, name: "Gudang Cadangan" },
]
const items = [{ id: 7, sku: "BRG-001", name: "Busi", unitOfMeasure: "pcs" }]
const workOrders = [{ id: 3, documentNo: "WO-001" }]

describe("MaterialRequestForm — a11y wiring F-078-S", () => {
  it("form aria-label tambah + aria-busy false; combobox gudang aria-required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <MaterialRequestForm warehouses={warehouses} items={items} workOrders={workOrders} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah permintaan antar gudang")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(2)
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Gudang Tujuan *", "Gudang Sumber *", "Perintah Kerja", "Tanggal Dibutuhkan"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah permintaan antar gudang", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <MaterialRequestForm
          warehouses={warehouses}
          items={items}
          workOrders={workOrders}
          request={{ id: 3, requesterWarehouseId: 1, sourceWarehouseId: 2, workOrderId: 3, neededBy: "2026-10-25", items: [{ itemId: 7, qty: 2 }] }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah permintaan antar gudang")
      unmount(root, container)
    })
  })
})

describe("MaterialRequestActions — kata §6 verbatim + gerbang status/izin", () => {
  function buttonTexts(container: HTMLElement) {
    return [...container.querySelectorAll("button")].map((b) => b.textContent?.trim())
  }

  it("diajukan + approve: Setujui/Tolak tampil persis; tanpa izin approve kosong", () => {
    withContainer((container) => {
      const root = mountInto(container, <MaterialRequestActions id={1} status="diajukan" canApprove canEdit={false} canCreateTransfer={false} />)
      expect(buttonTexts(container)).toEqual(expect.arrayContaining(["Setujui", "Tolak"]))
      unmount(root, container)
    })
    withContainer((container) => {
      const root = mountInto(container, <MaterialRequestActions id={1} status="diajukan" canApprove={false} canEdit={false} canCreateTransfer={false} />)
      expect(buttonTexts(container)).toEqual([])
      unmount(root, container)
    })
  })

  it("disetujui: Buat Transfer hanya bila izin transfer; Tutup Sisa Permintaan verbatim", () => {
    withContainer((container) => {
      const root = mountInto(container, <MaterialRequestActions id={1} status="disetujui" canApprove canEdit={false} canCreateTransfer />)
      expect(buttonTexts(container)).toEqual(expect.arrayContaining(["Buat Transfer", "Tutup Sisa Permintaan"]))
      unmount(root, container)
    })
    withContainer((container) => {
      const root = mountInto(container, <MaterialRequestActions id={1} status="disetujui" canApprove canEdit={false} canCreateTransfer={false} />)
      expect(buttonTexts(container)).not.toContain("Buat Transfer")
      unmount(root, container)
    })
  })

  it("draft + edit: Ajukan tampil; status terminal tidak ada tombol", () => {
    withContainer((container) => {
      const root = mountInto(container, <MaterialRequestActions id={1} status="draft" canApprove={false} canEdit canCreateTransfer={false} />)
      expect(buttonTexts(container)).toEqual(expect.arrayContaining(["Ajukan", "Batalkan"]))
      unmount(root, container)
    })
    withContainer((container) => {
      const root = mountInto(container, <MaterialRequestActions id={1} status="terpenuhi" canApprove canEdit canCreateTransfer />)
      expect(buttonTexts(container)).toEqual([])
      unmount(root, container)
    })
  })
})
