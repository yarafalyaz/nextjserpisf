import { describe, it, expect, vi, beforeEach } from "vitest"

const findFirstMock = vi.fn()
const writeFileMock = vi.fn()
const mkdirMock = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
    },
  },
}))

vi.mock("fs/promises", () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
}))

import {
  publicUrl,
  getStorageConfig,
  uploadToStorage,
  uploadToCloudIfEnabled,
  listCloudKeys,
  deleteFromCloud,
} from "../storage"

function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Uint8Array(sizeBytes)
  return new File([content], name, { type })
}

beforeEach(() => {
  findFirstMock.mockReset()
  writeFileMock.mockReset()
  mkdirMock.mockReset()
  writeFileMock.mockResolvedValue(undefined)
  mkdirMock.mockResolvedValue(undefined)
  delete process.env.NEXT_PUBLIC_ASSET_BASE_URL
  delete process.env.STORAGE_DRIVER
})

describe("publicUrl", () => {
  it("returns a relative /uploads path when no base url is set", () => {
    expect(publicUrl("logos/logo-1.png")).toBe("/uploads/logos/logo-1.png")
  })

  it("strips leading slashes from the key", () => {
    expect(publicUrl("///logos/logo-1.png")).toBe("/uploads/logos/logo-1.png")
  })

  it("uses an explicit base url and trims its trailing slash", () => {
    expect(publicUrl("logos/x.png", "https://cdn.test/")).toBe(
      "https://cdn.test/logos/x.png",
    )
  })

  it("falls back to NEXT_PUBLIC_ASSET_BASE_URL env", () => {
    process.env.NEXT_PUBLIC_ASSET_BASE_URL = "https://env-cdn.test"
    expect(publicUrl("a/b.png")).toBe("https://env-cdn.test/a/b.png")
  })
})

describe("getStorageConfig", () => {
  it("defaults to local driver when DB has no settings and no env", () => {
    findFirstMock.mockResolvedValue(null)
    return getStorageConfig().then((c) => {
      expect(c.driver).toBe("local")
      expect(c.fallbackLocal).toBe(true)
      expect(c.assetBaseUrl).toBe("")
    })
  })

  it("prefers DB settings over env", async () => {
    findFirstMock.mockResolvedValue({
      storageDriver: "r2",
      storageFallbackLocal: false,
      assetBaseUrl: "https://db-cdn.test",
      r2AccountId: "acct",
      r2AccessKeyId: "ak",
      r2SecretAccessKey: "x",
      r2Bucket: "bucket",
    })
    const c = await getStorageConfig()
    expect(c.driver).toBe("r2")
    expect(c.fallbackLocal).toBe(false)
    expect(c.assetBaseUrl).toBe("https://db-cdn.test")
    expect(c.r2Bucket).toBe("bucket")
  })

  it("falls back to env STORAGE_DRIVER when DB query throws", async () => {
    findFirstMock.mockRejectedValue(new Error("db down"))
    process.env.STORAGE_DRIVER = "local"
    const c = await getStorageConfig()
    expect(c.driver).toBe("local")
  })
})

describe("uploadToStorage", () => {
  it("rejects unsupported mime types", async () => {
    const file = makeFile("evil.exe", "application/octet-stream", 10)
    await expect(uploadToStorage(file, { category: "items" })).rejects.toThrow(
      /tidak didukung/,
    )
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it("rejects files over the size limit", async () => {
    const file = makeFile("big.png", "image/png", 6 * 1024 * 1024)
    await expect(
      uploadToStorage(file, { category: "items", maxBytes: 5 * 1024 * 1024 }),
    ).rejects.toThrow(/maksimal/)
  })

  it("writes locally and returns a key under the category", async () => {
    findFirstMock.mockResolvedValue(null)
    const file = makeFile("photo.PNG", "image/png", 100)
    const res = await uploadToStorage(file, { category: "logos", prefix: "logo" })
    expect(res.key).toMatch(/^logos\/logo-\d+-[a-z0-9]+\.png$/)
    expect(res.url).toBe(`/uploads/${res.key}`)
    expect(writeFileMock).toHaveBeenCalledOnce()
  })

  it("sanitizes a dangerous prefix and extension", async () => {
    findFirstMock.mockResolvedValue(null)
    const file = makeFile("x.p n!g", "image/png", 50)
    const res = await uploadToStorage(file, {
      category: "items",
      prefix: "../../etc/passwd",
    })
    // prefix stripped of path traversal chars, ext sanitized to alphanumerics
    expect(res.key.startsWith("items/etcpasswd-")).toBe(true)
    expect(res.key).not.toContain("..")
    expect(res.key).not.toContain("/etc/")
  })

  it("honors a custom allowedTypes list", async () => {
    findFirstMock.mockResolvedValue(null)
    const pdf = makeFile("doc.pdf", "application/pdf", 100)
    const res = await uploadToStorage(pdf, {
      category: "attachments",
      allowedTypes: ["application/pdf"],
    })
    expect(res.key).toMatch(/^attachments\/attachments-\d+/)
  })
})

describe("cloud helpers are no-ops on the local driver", () => {
  beforeEach(() => {
    findFirstMock.mockResolvedValue({
      storageDriver: "local",
      storageFallbackLocal: true,
      assetBaseUrl: null,
      r2AccountId: null,
      r2AccessKeyId: null,
      r2SecretAccessKey: null,
      r2Bucket: null,
    })
  })

  it("uploadToCloudIfEnabled returns false", async () => {
    const ok = await uploadToCloudIfEnabled("k", Buffer.from("x"), "text/plain")
    expect(ok).toBe(false)
  })

  it("listCloudKeys returns empty", async () => {
    expect(await listCloudKeys("logos/")).toEqual([])
  })

  it("deleteFromCloud resolves without throwing", async () => {
    await expect(deleteFromCloud("logos/x.png")).resolves.toBeUndefined()
  })
})
