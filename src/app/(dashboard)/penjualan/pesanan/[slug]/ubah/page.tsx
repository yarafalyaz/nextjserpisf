export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { SalesOrderForm } from "@/components/forms/sales-order-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { LockedEditGuard } from "@/components/ui/locked-edit-guard";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Pesanan" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_sales_orders");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) => prisma.salesOrder.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.salesOrder.findUnique({ where: { id, ...where } }),
    },
  );

  if (!data) notFound();

  // GL-BR-003 K1: cermin guard server updateSalesOrder fail-closed
  // (cancelled/completed/setelah-pelunasan-nyata pasti ditolak). Status
  // lain tanpa pelunasan nyata tetap boleh Ubah (fabrication pre-settlement).
  // `data` non-null sesudah notFound (TS tak menyempit via throw).
  const lockedOrder = data as NonNullable<typeof data>;
  function orderLockedGuard() {
    return (
      <LockedEditGuard
        preset={{
          section: "Pesanan Penjualan",
          sectionHref: "/penjualan/pesanan",
          documentKind: "Pesanan Penjualan",
          documentNo: lockedOrder.documentNo,
          slug: lockedOrder.slug ?? lockedOrder.id,
          correctionLabel: "retur/void faktur turunan",
          backLabel: "Kembali ke detail pesanan",
        }}
      />
    );
  }
  if (lockedOrder.status === "cancelled" || lockedOrder.status === "completed") {
    return orderLockedGuard();
  }
  const orderRealSettlementCount = await prisma.salesPayment.count({
    where: {
      NOT: { paymentMethod: "down_payment" },
      salesInvoice: { salesOrderId: lockedOrder.id },
    },
  });
  if (orderRealSettlementCount > 0) {
    return orderLockedGuard();
  }

  const [customers] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Pesanan Penjualan", href: "/penjualan/pesanan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <SalesOrderForm
        order={{
          id: data.id,
          customerId: data.customerId,
          // Tautan penawaran & tanggal pengiriman harus ikut: form mengirim ulang
          // kedua field ini, jadi tanpa dimuat nilainya akan terhapus saat simpan.
          quotationId: data.quotationId,
          date: data.date.toISOString().split("T")[0],
          deliveryDate: data.deliveryDate ? data.deliveryDate.toISOString().split("T")[0] : null,
          notes: data.notes,
        }}
        customers={customers}
      />
    </div>
  );
}
