import { describe, it, expect, vi } from "vitest"

// Putaran 84: email sesi wajib mengikuti DB. Callback jwt re-sync membaca
// email dari DB ke token; callback session memetakannya ke
// session.user.email. Tanpa pemetaan ini, ganti email via profil tak
// pernah tercermin di sesi sampai login ulang.

const captured = vi.hoisted(() => ({ config: undefined as any }))

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    captured.config = config
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() }
  },
}))
vi.mock("next-auth/providers/credentials", () => ({ default: () => ({ id: "credentials" }) }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        name: "Budi",
        email: "baru@contoh.id",
        avatar: null,
        isActive: true,
        password: "x".repeat(60),
        roles: [],
      }),
    },
  },
}))

import "@/lib/auth/auth"

describe("auth callbacks email (putaran 84)", () => {
  it("jwt re-sync menulis email DB ke token", async () => {
    const jwt = captured.config.callbacks.jwt
    const token: Record<string, unknown> = {
      id: "7",
      email: "lama@contoh.id",
      passwordHash: "x".repeat(12),
    }
    const out = await jwt({ token })
    expect(out.email).toBe("baru@contoh.id")
  })

  it("session memetakan token.email ke session.user.email", () => {
    const sessionCb = captured.config.callbacks.session
    const session = { user: {}, expires: "2999-01-01" }
    const out = sessionCb({
      session,
      token: { id: "7", name: "Budi", email: "baru@contoh.id", avatar: null, roles: [], permissions: [], isActive: true },
    })
    expect(out.user.email).toBe("baru@contoh.id")
  })
})
