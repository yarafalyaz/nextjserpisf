import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  customerFindMany: vi.fn(),
  userFindMany: vi.fn(),
  ticketForm: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customer: { findMany: mocks.customerFindMany },
    user: { findMany: mocks.userFindMany },
    crmTicket: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/utils/resolve-entity", () => ({
  resolveEntity: vi.fn().mockResolvedValue({
    id: 7,
    subject: "Mesin bunyi",
    description: null,
    priority: "medium",
    status: "open",
    assignedTo: 22,
    ticketNumber: "TKT-7",
    customerId: 11,
    customerName: null,
    customerEmail: null,
    customerPhone: null,
    type: "support",
    resolutionNotes: null,
  }),
}))
vi.mock("@/components/forms/ticket-form", () => ({
  TicketForm: (props: unknown) => {
    mocks.ticketForm(props)
    return null
  },
}))
vi.mock("@/components/ui/breadcrumbs", () => ({ AppBreadcrumbs: () => null }))
vi.mock("next/navigation", () => ({ notFound: vi.fn() }))

import EditPage from "../page"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.customerFindMany.mockResolvedValue([{ id: 11, name: "Pelanggan Lama" }])
  mocks.userFindMany.mockResolvedValue([{ id: 22, name: "Teknisi Lama" }])
})

describe("Ubah Tiket (putaran 99)", () => {
  it("menawarkan entitas hidup plus tautan tiket saat ini", async () => {
    const node = await EditPage({ params: Promise.resolve({ slug: "tkt-7" }) }) as any
    const form = node.props.children[2]

    expect(mocks.customerFindMany).toHaveBeenCalledWith({
      where: { OR: [{ isActive: true, deletedAt: null }, { id: 11 }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    })
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: { OR: [{ isActive: true }, { id: 22 }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    })
    expect(form.props.customers).toEqual([{ id: 11, name: "Pelanggan Lama" }])
    expect(form.props.users).toEqual([{ id: 22, name: "Teknisi Lama" }])
  })
})
