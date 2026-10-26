import { describe, expect, it } from "vitest"

import {
  PASSWORD_MIN_LENGTH,
  passwordPolicyError,
  passwordPolicyIssue,
} from "../password-policy"

describe("passwordPolicyIssue", () => {
  it("rejects passwords shorter than the minimum length", () => {
    expect(passwordPolicyIssue("pendek")).toBe("short")
    expect(passwordPolicyIssue("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
      "short",
    )
  })

  it("rejects common passwords even at sufficient length", () => {
    expect(passwordPolicyIssue("administrator")).toBe("common")
    expect(passwordPolicyIssue("ADMINISTRATOR")).toBe("common")
    expect(passwordPolicyIssue("Password123")).toBe("short") // length first
  })

  it("maps issues to Indonesian messages", () => {
    expect(passwordPolicyError("pendek")).toBe("Password minimal 12 karakter")
    expect(passwordPolicyError("pendek", "Kata sandi")).toBe(
      "Kata sandi minimal 12 karakter",
    )
    expect(passwordPolicyError("administrator")).toBe(
      "Password terlalu umum, gunakan kata sandi lain",
    )
    expect(passwordPolicyError("bengkel-besi-jaya-2026")).toBeNull()
  })

  it("accepts long unique passphrases", () => {
    expect(passwordPolicyIssue("bengkel-besi-jaya-2026")).toBeNull()
    expect(passwordPolicyIssue("KopiPahitTanpaGula!")).toBeNull()
  })
})
