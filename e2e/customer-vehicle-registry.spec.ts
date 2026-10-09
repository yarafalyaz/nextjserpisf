import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

// The registry reads identity through the Vehicle relation, so the fixture has
// to create BOTH rows (Vehicle = physical unit, CustomerVehicle = ownership
// link). Seeding it here keeps the spec self-contained: CI's seed creates a
// customer but no customer vehicles, and relying on UI form filling (three
// cascading comboboxes) would be far more brittle.
const PLATE = "B 9999 E2E"
const CHASSIS = "RANGKA-E2E-REGISTRY"
const CUSTOMER_NAME = "E2E Registry Pelanggan"

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})

test.describe("Kendaraan Pelanggan", () => {
  test.beforeAll(async () => {
    const { prisma } = await import("@/lib/db/prisma")

    const variant = await prisma.vehicleVariant.findFirst({ select: { id: true } })
    if (!variant) throw new Error("fixture: no vehicle variant seeded")

    const customer = await prisma.customer.create({
      data: { name: CUSTOMER_NAME, isActive: true },
    })
    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleVariantId: variant.id,
        plateNumber: PLATE,
        year: 2021,
        color: "Merah E2E",
      },
    })
    await prisma.customerVehicle.create({
      data: {
        customerId: customer.id,
        vehicleId: vehicle.id,
        vehicleType: "Truck",
        chassisNumber: CHASSIS,
        engineNumber: "MESIN-E2E-REGISTRY",
        isActive: true,
      },
    })

    await prisma.$disconnect()
  })

  test.afterAll(async () => {
    const { prisma } = await import("@/lib/db/prisma")
    // CustomerVehicle.vehicle is onDelete: Cascade, so removing the customer
    // (or the vehicle) clears the link; delete both explicitly to be safe.
    await prisma.customerVehicle.deleteMany({ where: { chassisNumber: CHASSIS } })
    await prisma.vehicle.deleteMany({ where: { plateNumber: PLATE } })
    await prisma.customer.deleteMany({ where: { name: CUSTOMER_NAME } })
    await prisma.$disconnect()
  })

  test("lists customer vehicles and searches by plate / chassis", async ({ page }) => {
    await page.goto("/kendaraan/pelanggan", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("heading", { name: "Kendaraan Pelanggan" })).toBeVisible()
    await expect(page.locator("body")).toContainText(CUSTOMER_NAME)
    await expect(page.locator("body")).toContainText(PLATE)

    // Server-side search: plate term narrows to the fixture row.
    await page.goto("/kendaraan/pelanggan?cari=B%209999", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(PLATE)

    // Chassis search resolves too (identity field that lives on CustomerVehicle).
    await page.goto(`/kendaraan/pelanggan?cari=${encodeURIComponent(CHASSIS)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(PLATE)
  })
})
