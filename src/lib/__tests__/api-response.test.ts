import { describe, it, expect } from "vitest"
import { apiError, apiOk } from "../api-response"
import { NextResponse } from "next/server"

describe("api-response", () => {
  describe("apiError", () => {
    it("returns correct status and body for error codes", () => {
      const res = apiError("NOT_FOUND", "Tidak ditemukan")
      expect(res.status).toBe(404)
    })

    it("defaults message to code when not provided", () => {
      const res = apiError("UNAUTHORIZED")
      expect(res.status).toBe(401)
    })

    it("defaults to 500 for unknown codes", () => {
      const res = apiError("UNKNOWN" as any, "Waduh")
      expect(res.status).toBe(500)
    })
  })

  describe("apiOk", () => {
    it("wraps data in data property", () => {
      const res = apiOk({ id: 1 })
      expect(res.status).toBe(200)
    })
  })
})
