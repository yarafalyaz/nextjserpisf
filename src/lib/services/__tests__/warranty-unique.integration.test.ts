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

describe("WarrantyCoverage unique DB (F-021-HARDEN-UNIQUE)", () => {
  it("dua create bersamaan → tepat 1 coverage per (WO,item,serial) termasuk tanpa serial", async () => {
    if (process.env.RUN_DB_INTEGRATION !== "1") { console.warn("RUN_DB_INTEGRATION tidak aktif — lewati"); return }
    if (!dbUp) { console.warn("DB tidak terjangkau — lewati"); return }

    const stamp = Date.now()
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
      data: {
        customerId: customer.id,
        vehicleId: vehicle.id,
        plateNumber: `IT ${stamp}`,
      },
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

    try {
      const installedAt = new Date()
      const [a, b] = await Promise.all([
        createWarrantyCoveragesForWorkOrder(workOrder.id, installedAt, prisma),
        createWarrantyCoveragesForWorkOrder(workOrder.id, installedAt, prisma),
      ])
      // Total yang lahir dari kedua panggilan = 2 unit (serial + tanpa serial).
      expect(a.created + b.created).toBe(2)

      const rows = await prisma.warrantyCoverage.findMany({
        where: { workOrderId: workOrder.id },
        select: { serialNumber: true, serialKey: true },
        orderBy: { serialKey: "asc" },
      })
      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.serialKey).sort()).toEqual(["", "IT-SN-1"])
      expect(rows.find((r) => r.serialKey === "")?.serialNumber).toBeNull()

      // Panggilan ketiga (idempotensi sekuensial) tidak menambah apa pun.
      const again = await createWarrantyCoveragesForWorkOrder(workOrder.id, installedAt, prisma)
      expect(again.created).toBe(0)
    } finally {
      await prisma.warrantyCoverage.deleteMany({ where: { workOrderId: workOrder.id } })
      await prisma.materialIssue.deleteMany({ where: { workOrderId: workOrder.id } })
      await prisma.workOrder.delete({ where: { id: workOrder.id } })
      await prisma.item.delete({ where: { id: item.id } })
      await prisma.warehouse.delete({ where: { id: warehouse.id } })
      await prisma.customerVehicle.delete({ where: { id: customerVehicle.id } })
      await prisma.vehicle.delete({ where: { id: vehicle.id } })
      await prisma.vehicleVariant.delete({ where: { id: variant.id } })
      await prisma.vehicleModel.delete({ where: { id: model.id } })
      await prisma.vehicleBrand.delete({ where: { id: brand.id } })
      await prisma.customer.delete({ where: { id: customer.id } })
    }
  })
})
