// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { TaskForm } from "../task-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/project.actions", () => ({ createTask: vi.fn(), updateTask: vi.fn() }))

const projects = [{ id: 1, name: "Proyek A" }]
const employees = [{ id: 2, name: "Karyawan A" }]

describe("TaskForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, Proyek/Nama bintang dekoratif + wajib, Status/opsional bersih", () => {
    withContainer((container) => {
      const root = mountInto(container, <TaskForm projects={projects} employees={employees} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah tugas")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Proyek *", "Nama Tugas *", "Status", "Ditugaskan Ke"]))
      expect(container.querySelector("#task-project")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#task-name")!.getAttribute("required")).not.toBeNull()
      expect(container.querySelector("#task-status")!.getAttribute("required")).toBeNull()
      expect(container.querySelector("#task-assigned")!.getAttribute("aria-required")).not.toBe("true")
      unmount(root, container)
    })
  })

  it("ubah: aria-label ubah tugas + nama terisi", () => {
    withContainer((container) => {
      const task = { id: 9, projectId: 1, name: "Tugas Lama", status: "pending" }
      const root = mountInto(container, <TaskForm projects={projects} employees={employees} task={task} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah tugas")
      expect(container.querySelector<HTMLInputElement>("#task-name")!.value).toBe("Tugas Lama")
      unmount(root, container)
    })
  })
})
