// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { ProjectForm } from "../project-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/project.actions", () => ({ createProject: vi.fn(), updateProject: vi.fn() }))
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

const customers = [{ id: 1, name: "PT Uji" }]

describe("ProjectForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, pelanggan wajib aria-required, 2 bintang dekoratif", () => {
    withContainer((container) => {
      const root = mountInto(container, <ProjectForm customers={customers} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah proyek")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama Proyek *", "Pelanggan *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah proyek + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <ProjectForm
          customers={customers}
          project={{ id: 3, name: "Proyek Bengkel", documentNo: "PRJ-0001", description: null, customerId: 1, customerVehicleId: null, workOrderId: null, startDate: null, endDate: null, notes: null, status: "active" }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah proyek")
      expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe("Proyek Bengkel")
      unmount(root, container)
    })
  })
})
