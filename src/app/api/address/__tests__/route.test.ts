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
    expect(body.error).toMatch(/tidak valid/)
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

  it("allows requests with no kodeInduk (provinces list)", async () => {
    readFileMock.mockResolvedValue("11,ACEH,0,0")
    const res = await GET(req("tipe=provinces"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toMatchObject({ code: "11" })
  })

  it("returns 400 for an unknown tipe", async () => {
    const res = await GET(req("tipe=galaxy"))
    expect(res.status).toBe(400)
  })
})
