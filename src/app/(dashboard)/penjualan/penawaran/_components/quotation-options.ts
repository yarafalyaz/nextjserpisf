import { prisma } from "@/lib/db/prisma";

/**
 * Opsi form Penawaran (pelanggan, kendaraan pelanggan, barang, metode,
 * produk, satuan) — dipakai halaman tambah dan ubah. Tambah dan ubah
 * memetakan barang sedikit berbeda (tambah hanya id/nama/harga/satuan,
 * ubah meneruskan seluruh baris barang + harga ternormalisasi), jadi
 * pemetaan barang tetap di masing-masing halaman; helper ini hanya
 * mengambil baris mentahnya dan memetakan kendaraan + produk yang identik.
 */
export async function loadQuotationFormOptions() {
  const [customers, customerVehicles, itemsList, paymentMethods, shippingMethods, productsList, unitOptions] =
    await Promise.all([
      prisma.customer.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.customerVehicle.findMany({
        include: {
          vehicle: {
            include: {
              variant: {
                include: {
                  model: {
                    include: { brand: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.item.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, price: true, unitOfMeasure: true },
      }),
      prisma.paymentMethod.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { code: true, name: true },
      }),
      prisma.shippingMethod.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { code: true, name: true },
      }),
      prisma.product.findMany({
        orderBy: { name: "asc" },
        include: { materials: true },
      }),
      prisma.unitOfMeasure.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { name: true, symbol: true, category: true },
      }),
    ]);

  // Transform customerVehicles to a simpler shape for the form
  const vehicles = customerVehicles.map((cv) => ({
    id: cv.id,
    customerId: cv.customerId,
    plateNumber: cv.plateNumber || "-",
    brandName: cv.vehicle?.variant?.model?.brand?.name || "",
    modelName: cv.vehicle?.variant?.model?.name || "",
  }));

  // Map items to lookup map for product materials
  const itemsMap = new Map(itemsList.map((item) => [item.id, item]));

  // Map products to include item info in materials
  const products = productsList.map((p) => {
    const totalPrice = p.materials.reduce((sum, m) => {
      const item = itemsMap.get(m.itemId);
      return sum + (item ? Number(m.qty) * Number(item.price) : 0);
    }, 0);

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      standardCost: totalPrice > 0 ? totalPrice : Number(p.standardCost),
      materials: p.materials.map((m) => {
        const item = itemsMap.get(m.itemId);
        return {
          itemId: m.itemId,
          qty: Number(m.qty),
          name: item?.name || "Barang Tidak Dikenal",
          price: item ? Number(item.price) : 0,
          unitOfMeasure: item?.unitOfMeasure || "PCS",
        };
      }),
    };
  });

  return { customers, vehicles, itemsList, paymentMethods, shippingMethods, products, unitOptions };
}
