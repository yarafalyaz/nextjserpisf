// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  vehicleFindMany: vi.fn(),
  vehicleCount: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vehicle: { findMany: mocks.vehicleFindMany, count: mocks.vehicleCount },
  },
}))

vi.mock("@/components/auth/can-create", () => ({
  CanCreate: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/components/ui/breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}))

vi.mock("../_components/vehicle-table", () => ({ VehicleTable: () => null }))

vi.mock("next/link", async () => {
  const React = await import("react")
  return {
    default: ({ href, children, ...rest }: Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children as never),
  }
})

import VehiclesPage from "../page"

describe("VehiclesPage pencarian (putaran 92)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.vehicleFindMany.mockResolvedValue([])
    mocks.vehicleCount.mockResolvedValue(0)
  })

  it("kata non-numerik tidak lagi menyuntikkan cabang tahun kosong yang cocok ke semua baris", async () => {
    await VehiclesPage({ searchParams: Promise.resolve({ cari: "avanza" }) })

    const where = mocks.vehicleFindMany.mock.calls[0]?.[0]?.where
    expect(where.OR).toEqual([
      { name: { contains: "avanza" } },
      { variant: { name: { contains: "avanza" } } },
      { variant: { model: { name: { contains: "avanza" } } } },
      { variant: { model: { brand: { name: { contains: "avanza" } } } } },
    ])
    expect(mocks.vehicleCount.mock.calls[0]?.[0]?.where).toEqual(where)
  })

  it("tahun numerik tetap menjadi cabang pencarian tahun", async () => {
    await VehiclesPage({ searchParams: Promise.resolve({ cari: "2024" }) })

    const where = mocks.vehicleFindMany.mock.calls[0]?.[0]?.where
    expect(where.OR).toContainEqual({ year: 2024 })
  })
})
