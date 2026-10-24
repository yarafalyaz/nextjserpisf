// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { UserCreateForm } from "../user-create-form"
import { decorativeStars, labelTexts } from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)
vi.mock("@/actions/auth.actions", () => ({ createUser: vi.fn() }))

function mount(roles: { id: number; name: string }[]) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(<UserCreateForm roles={roles} />)
  })
  return { container, root }
}

describe("UserCreateForm — a11y wiring", () => {
  it("aria-label tambah + aria-busy false; Nama/Email/Kata Sandi wajib + bintang dekoratif; Peran opsional tanpa bintang", () => {
    const { container, root } = mount([{ id: 1, name: "admin" }])
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah pengguna")
    expect(form.getAttribute("aria-busy")).toBe("false")
    for (const id of ["name", "email", "password"]) {
      expect(container.querySelector(`#${id}`)!.getAttribute("required")).not.toBeNull()
    }
    expect(container.querySelector("#password")!.getAttribute("type")).toBe("password")
    expect(decorativeStars(form).length).toBe(3)
    expect(labelTexts(form)).toEqual(
      expect.arrayContaining(["Nama *", "Email *", "Kata Sandi *", "Peran"]),
    )
    act(() => root.unmount())
    container.remove()
  })
})
