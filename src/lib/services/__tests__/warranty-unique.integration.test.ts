import "dotenv/config"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { createWarrantyCoveragesForWorkOrder } from "../warranty.service"

/**
 * F-021-HARDEN-UNIQUE (DB integration, opt-in RUN_DB_INTEGRATION=1):
 * dua penyelesaian WO bersamaan tidak boleh melahirkan coverage ganda.
 * Cek-baca-tulis di service saja tidak cukup (kedua transaksi bisa melihat
 * kosong lalu sama-sama create); jangkar terakhir adalah unique DB
 * (work_order_id, item_id, serial_key) dengan serialKey = serial ?? "".
 * Pelanggar kedua menerima P2002 yang ditelan service sebagai sudah-ada.
 */
let dbUp = false
beforeAll(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return
  try {
    await prisma.$queryRaw`SELECT 1`
    dbUp = true
  } catch {
    dbUp = false
  }
})
afterAll(async () => {
  try { await prisma.$disconnect() } catch { /* abaikan */ }
})

async function seedWarrantyWorld(stamp: number) {
  const customer = await prisma.customer.create({
    data: { name: `IT-F021 ${stamp}`, code: `ITF021-${stamp}` },
  })
  const brand = await prisma.vehicleBrand.create({ data: { name: `IT-Brand ${stamp}` } })
  const model = await prisma.vehicleModel.create({
    data: { name: `IT-Model ${stamp}`, vehicleBrandId: brand.id },
  })
  const variant = await prisma.vehicleVariant.create({
    data: { name: `IT-Variant ${stamp}`, vehicleModelId: model.id },
  })
  const vehicle = await prisma.vehicle.create({
    data: { name: `IT-VHC ${stamp}`, vehicleVariantId: variant.id },
  })
  const customerVehicle = await prisma.customerVehicle.create({
    data: { customerId: customer.id, vehicleId: vehicle.id, plateNumber: `IT ${stamp}` },
  })
  const warehouse = await prisma.warehouse.create({
    data: { code: `ITW${stamp}`, name: `IT WH ${stamp}` },
  })
  const item = await prisma.item.create({
    data: {
      sku: `IT-F021-${stamp}`,
      name: `IT bumper ${stamp}`,
      unitOfMeasure: "PCS",
      isProduct: true,
      qtyOnHand: 0,
      warrantyMonths: 12,
    },
  })
  const workOrder = await prisma.workOrder.create({
    data: {
      documentNo: `IT-WO-${stamp}`,
      customerId: customer.id,
      customerVehicleId: customerVehicle.id,
      date: new Date(),
      status: "completed",
    },
  })
  // Dua baris terpasang: satu berserial, satu tanpa serial (jalur NULL
  // yang tidak ditahan unique biasa di MySQL).
  await prisma.materialIssue.create({
    data: {
      documentNo: `IT-MI-${stamp}`,
      warehouseId: warehouse.id,
      workOrderId: workOrder.id,
      date: new Date(),
      status: "completed",
      items: {
        create: [
          { itemId: item.id, qty: 1, serialNumbers: ["IT-SN-1"] },
          { itemId: item.id, qty: 1, serialNumbers: undefined },
        ],
      },
    },
  })
  const ids = {
    customerId: customer.id, brandId: brand.id, modelId: model.id, variantId: variant.id,
    vehicleId: vehicle.id, customerVehicleId: customerVehicle.id, warehouseId: warehouse.id,
    itemId: item.id, workOrderId: workOrder.id,
  }
  const cleanup = async () => {
    await prisma.warrantyCoverage.deleteMany({ where: { workOrderId: ids.workOrderId } })
    await prisma.materialIssue.deleteMany({ where: { workOrderId: ids.workOrderId } })
    await prisma.workOrder.delete({ where: { id: ids.workOrderId } })
    await prisma.item.delete({ where: { id: ids.itemId } })
    await prisma.warehouse.delete({ where: { id: ids.warehouseId } })
    await prisma.customerVehicle.delete({ where: { id: ids.customerVehicleId } })
    await prisma.vehicle.delete({ where: { id: ids.vehicleId } })
    await prisma.vehicleVariant.delete({ where: { id: ids.variantId } })
    await prisma.vehicleModel.delete({ where: { id: ids.modelId } })
    await prisma.vehicleBrand.delete({ where: { id: ids.brandId } })
    await prisma.customer.delete({ where: { id: ids.customerId } })
  }
  return { ids, cleanup }
}

describe("WarrantyCoverage unique DB (F-021-HARDEN-UNIQUE)", () => {
  it("dua create bersamaan → tepat 1 coverage per (WO,item,serial) termasuk tanpa serial", async () => {
    if (process.env.RUN_DB_INTEGRATION !== "1") { console.warn("RUN_DB_INTEGRATION tidak aktif — lewati"); return }
    if (!dbUp) { console.warn("DB tidak terjangkau — lewati"); return }

    const { ids, cleanup } = await seedWarrantyWorld(Date.now())

    try {
      const installedAt = new Date()
      const [a, b] = await Promise.all([
        createWarrantyCoveragesForWorkOrder(ids.workOrderId, installedAt, prisma),
        createWarrantyCoveragesForWorkOrder(ids.workOrderId, installedAt, prisma),
      ])
      // Total yang lahir dari kedua panggilan = 2 unit (serial + tanpa serial).
      expect(a.created + b.created).toBe(2)

      const rows = await prisma.warrantyCoverage.findMany({
        where: { workOrderId: ids.workOrderId },
        select: { serialNumber: true, serialKey: true },
        orderBy: { serialKey: "asc" },
      })
      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.serialKey).sort()).toEqual(["", "IT-SN-1"])
      expect(rows.find((r) => r.serialKey === "")?.serialNumber).toBeNull()

      // Panggilan ketiga (idempotensi sekuensial) tidak menambah apa pun.
      const again = await createWarrantyCoveragesForWorkOrder(ids.workOrderId, installedAt, prisma)
      expect(again.created).toBe(0)
    } finally {
      await cleanup()
    }
  })
})
