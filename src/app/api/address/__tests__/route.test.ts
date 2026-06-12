import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const readFileMock = vi.fn()

vi.mock("fs/promises", () => ({
  readFile: (...a: unknown[]) => readFileMock(...a),
}))

import { GET } from "../route"

function req(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/address?${qs}`)
}

beforeEach(() => {
  readFileMock.mockReset()
})

describe("GET /api/address — kodeInduk validation", () => {
  it("rejects a non-numeric kodeInduk with 400 (path-traversal guard)", async () => {
    const res = await GET(req("tipe=villages&kodeInduk=../../etc/passwd"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toMatch(/tidak valid/)
    // never touched the filesystem
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it("rejects kodeInduk with dots", async () => {
    const res = await GET(req("tipe=regencies&kodeInduk=11.5"))
    expect(res.status).toBe(400)
  })

  it("rejects kodeInduk with slashes", async () => {
    const res = await GET(req("tipe=villages&kodeInduk=11/x"))
    expect(res.status).toBe(400)
  })

  it("accepts a purely numeric kodeInduk", async () => {
    readFileMock.mockResolvedValue("1101,11,KABUPATEN ACEH SELATAN,0,0")
    const res = await GET(req("tipe=regencies&kodeInduk=11"))
    expect(res.status).toBe(200)
  })

  it("allows requests with no kodeInduk (provinces list) and caches the response", async () => {
    readFileMock.mockResolvedValue("11,ACEH,0,0")
    const res = await GET(req("tipe=provinces"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toMatchObject({ code: "11" })

    // Call again to exercise the cache.has(filePath) branch in loadCSV
    const resCached = await GET(req("tipe=provinces"))
    expect(resCached.status).toBe(200)
    const bodyCached = await resCached.json()
    expect(bodyCached[0]).toMatchObject({ code: "11" })
    
    // File system should only be read once
    expect(readFileMock).toHaveBeenCalledTimes(1)
  })

  it("returns 400 for an unknown tipe", async () => {
    const res = await GET(req("tipe=galaxy"))
    expect(res.status).toBe(400)
  })

  it("handles districts type with parentCode", async () => {
    readFileMock.mockResolvedValue("1101010,1101,BAKONGAN,0,0\n1101020,1101,KLUET UTARA,0,0")
    const res = await GET(req("tipe=districts&kodeInduk=1101"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([
      { code: "1101010", name: "Bakongan" },
      { code: "1101020", name: "Kluet Utara" },
    ])
  })

  it("handles villages type with parentCode derived province", async () => {
    readFileMock.mockResolvedValue("1101010001,1101010,KEUDE BAKONGAN,0,0,23711\n1101010002,1101010,DESA DUA,0,0,")
    const res = await GET(req("tipe=villages&kodeInduk=1101010"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([
      { code: "1101010001", name: "Keude Bakongan", postalCode: "23711" },
      { code: "1101010002", name: "Desa Dua", postalCode: "" },
    ])
    // derive filename from first 2 digits of parentCode (11)
    expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining("villages/11.csv"), "utf-8")
  })

  it("returns 500 when filesystem read fails", async () => {
    // Reset module registry so the route's in-memory CSV cache (Map at module
    // level) is wiped — previous tests successfully cached their files, and
    // we need a fresh read on this one to exercise the catch block.
    vi.resetModules()
    readFileMock.mockReset()
    readFileMock.mockRejectedValue(new Error("Disk error"))
    const { GET: FreshGET } = await import("../route")
    const res = await FreshGET(req("tipe=provinces"))
    expect(res.status).toBe(500)
  })
})
