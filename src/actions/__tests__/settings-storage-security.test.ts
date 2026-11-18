import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
  logActivityMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.findFirstMock, update: mocks.updateMock },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: vi.fn(async () => 1),
        systemSetting: {
          findFirst: mocks.findFirstMock,
          update: mocks.updateMock,
        },
        account: { findMany: vi.fn(async () => []) },
      }),
    ),
  },
}))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidatePathMock(...a) }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirectMock(url)
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
  },
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))

import { updateStorageSettings, updateSystemSettings } from "../settings.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.findFirstMock.mockResolvedValue({ id: 1 })
  mocks.updateMock.mockResolvedValue({ id: 1 })
  mocks.logActivityMock.mockResolvedValue(undefined)
})

describe("H2: updateStorageSettings security & validated persistence", () => {
  it("rejects arbitrary storageDriver outside local/r2 and returns { success: false, error }", async () => {
    const res = await updateStorageSettings(fd({ storageDriver: "s3" }))
    expect(res).toEqual({ success: false, error: expect.stringContaining("Validasi gagal") })
    expect(mocks.updateMock).not.toHaveBeenCalled()
  })

  it("rejects SSRF payloads in r2AccountId and returns { success: false, error }", async () => {
    for (const payload of ["evil.com/x#", "acct-123", "12345.internal", "abc"]) {
      const res = await updateStorageSettings(
        fd({ storageDriver: "r2", r2AccountId: payload }),
      )
      expect(res, payload).toEqual({
        success: false,
        error: expect.stringContaining("Validasi gagal"),
      })
      expect(mocks.updateMock).not.toHaveBeenCalled()
    }
  })

  it("rejects non-https assetBaseUrl schemes (javascript:, data:, http:, protocol-relative)", async () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://cdn.example.com",
      "//evil.com/cdn",
      "https://user:pass@cdn.example.com",
    ]) {
      const res = await updateStorageSettings(
        fd({ storageDriver: "local", assetBaseUrl: url }),
      )
      expect(res, url).toEqual({
        success: false,
        error: expect.stringContaining("Validasi gagal"),
      })
      expect(mocks.updateMock).not.toHaveBeenCalled()
    }
  })

  it("persists validated & normalized parsed.data and preserves existing secret when blank", async () => {
    const validAccountId = "0123456789abcdef0123456789abcdef"
    await expect(
      updateStorageSettings(
        fd({
          storageDriver: "r2",
          storageFallbackLocal: "on",
          assetBaseUrl: "  https://cdn.example.com/assets/  ",
          r2AccountId: `  ${validAccountId}  `,
          r2AccessKeyId: "  ak_live_123  ",
          r2Bucket: "  my-bucket  ",
          r2SecretAccessKey: "   ",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT")

    expect(mocks.updateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        storageDriver: "r2",
        storageFallbackLocal: true,
        assetBaseUrl: "https://cdn.example.com/assets",
        r2AccountId: validAccountId,
        r2AccessKeyId: "ak_live_123",
        r2Bucket: "my-bucket",
      },
    })
  })

  it("allows blank assetBaseUrl and clears it to null", async () => {
    await expect(
      updateStorageSettings(fd({ storageDriver: "local", assetBaseUrl: "" })),
    ).rejects.toThrow("NEXT_REDIRECT")

    expect(mocks.updateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        storageDriver: "local",
        storageFallbackLocal: false,
        assetBaseUrl: null,
        r2AccountId: null,
        r2AccessKeyId: null,
        r2Bucket: null,
      },
    })
  })

  it("returns sanitized { success: false, error } on DB failure instead of throwing", async () => {
    mocks.updateMock.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed on `system_settings`"), { code: "P2002" }),
    )
    const res = await updateStorageSettings(fd({ storageDriver: "local" }))
    expect(res).toEqual({
      success: false,
      error: "Data dengan nilai tersebut sudah ada.",
    })
  })
})

describe("H2: updateSystemSettings returns { success: false, error } instead of throwing", () => {
  it("returns sanitized { success: false, error } on DB errors", async () => {
    mocks.updateMock.mockRejectedValueOnce(
      Object.assign(new Error("can't reach database at 10.0.0.5:3306"), { code: "P2024" }),
    )
    const res = await updateSystemSettings(fd({ companyName: "PT Test" }))
    expect(res).toEqual({
      success: false,
      error: "Koneksi database habis waktu. Coba lagi.",
    })
  })
})

describe("storage-form.tsx FormActions & touch targets", () => {
  it("uses <FormActions> and min-h-11 md:min-h-9 w-full md:w-auto buttons", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(dashboard)/pengaturan/penyimpanan/ubah/_components/storage-form.tsx",
      ),
      "utf8",
    )
    expect(src).toContain("<FormActions>")
    expect(src).toContain("min-h-11 md:min-h-9 w-full md:w-auto")
  })
})
