// @vitest-environment node
import { describe, it, expect } from "vitest"

import {
  loginSchema,
  changePasswordSchema,
} from "../auth.schemas"

/**
 * Skema login & ubah kata sandi (kanonik: lib/validations/auth.schemas).
 *
 * Dipindahkan dari `src/lib/validators/__tests__/validators.test.ts` saat dua pohon
 * validasi disatukan (2026-10-13). Aturan yang diuji tidak berubah.
 */

describe("loginSchema", () => {
  it("accepts valid login", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "secret123" })
    expect(result.success).toBe(true)
  })

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "secret" })
    expect(result.success).toBe(false)
  })

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" })
    expect(result.success).toBe(false)
  })
})

describe("changePasswordSchema", () => {
  it("accepts a valid current + new password pair", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old123",
      newPassword: "kata-sandi-baru-kuat",
    })
    expect(result.success).toBe(true)
  })

  it("menolak field tambahan (skema kanonik bersifat strict)", () => {
    // Skema kanonik hanya menjaga dua string password; `confirmPassword` sengaja
    // TIDAK diterima di sini (pencocokan konfirmasi urusan form). Dulu skema lama
    // (lib/validators) memuatnya — drift ini ditemukan saat tes dipindahkan.
    const result = changePasswordSchema.safeParse({
      currentPassword: "old123",
      newPassword: "kata-sandi-baru-kuat",
      confirmPassword: "newpass88",
    })
    expect(result.success).toBe(false)
  })


  it("rejects short new password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "short",
      confirmPassword: "short",
    })
    expect(result.success).toBe(false)
  })
})
