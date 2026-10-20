// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { ProfileForm } from "../profile-form"
import { mountInto, unmount, withContainer } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("next-auth/react", () => ({ useSession: () => ({ update: vi.fn() }) }))
vi.mock("@/actions/auth.actions", () => ({ changePassword: vi.fn(), updateProfile: vi.fn() }))

describe("ProfileForm — label wiring", () => {
  it("tiap label menunjuk input uniknya; label email-password tidak merebut field password lama", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <ProfileForm user={{ id: 1, name: "Admin", email: "a@b.c", avatar: null }} roles={["Admin"]} />,
      )
      const labels = Array.from(container.querySelectorAll("label"))
      expect(labels.length).toBeGreaterThan(0)
      for (const label of labels) {
        const targetId = label.getAttribute("for")
        expect(targetId, label.textContent ?? "").toBeTruthy()
        const target = container.querySelector(`#${targetId}`)
        expect(target, label.textContent ?? "").not.toBeNull()
        expect(target!.tagName).toBe("INPUT")
      }
      const emailPw = labels.find((l) => l.textContent?.includes("wajib bila ganti email"))
      expect(emailPw!.getAttribute("for")).toBe("profileCurrentPassword")
      expect(container.querySelector("#profileCurrentPassword")!.getAttribute("name")).toBe("currentPassword")
      const oldPw = labels.find((l) => l.textContent === "Kata Sandi Lama")
      expect(oldPw!.getAttribute("for")).toBe("currentPassword")
      expect(emailPw!.getAttribute("for")).not.toBe(oldPw!.getAttribute("for"))
      unmount(root, container)
    })
  })
})
