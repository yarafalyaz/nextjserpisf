import { prisma } from "@/lib/db/prisma";

/**
 * Opsi pelanggan + penawaran (Diterima/Disetujui) untuk form Uang Muka.
 * Dipakai halaman tambah dan ubah; filter pelanggan berbeda antar halaman
 * (tambah hanya yang aktif, ubah semua yang belum terhapus), jadi filter itu
 * tetap argumen pemanggil, bukan disembunyikan di helper.
 */
export async function loadDownPaymentFormOptions(customerWhere: {
  isActive?: boolean;
  deletedAt: null;
}) {
  const [customersList, quotationsList] = await Promise.all([
    prisma.customer.findMany({
      where: customerWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        customerCategory: {
          select: {
            downPaymentPercent: true,
          },
        },
      },
    }),
    prisma.quotation.findMany({
      where: { status: { in: ["accepted", "approved"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentNo: true,
        customerId: true,
        grandTotal: true,
        sections: {
          select: {
            id: true,
            name: true,
            items: {
              select: {
                id: true,
                description: true,
                qty: true,
                uom: true,
                unitPrice: true,
                total: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const customers = customersList.map((c) => ({
    id: c.id,
    name: c.name,
    customerCategory: c.customerCategory
      ? { downPaymentPercent: Number(c.customerCategory.downPaymentPercent) }
      : null,
  }));

  const quotations = quotationsList.map((q) => ({
    id: q.id,
    documentNo: q.documentNo,
    customerId: q.customerId,
    grandTotal: Number(q.grandTotal),
    sections: q.sections.map((s) => ({
      id: s.id,
      name: s.name,
      items: s.items.map((i) => ({
        id: i.id,
        description: i.description,
        qty: Number(i.qty),
        uom: i.uom,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
      })),
    })),
  }));

  return { customers, quotations };
}
