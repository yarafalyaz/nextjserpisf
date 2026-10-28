export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { SalesInvoiceForm } from "@/components/forms/sales-invoice-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { LockedEditGuard } from "@/components/ui/locked-edit-guard";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Faktur" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_sales_invoices");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) => prisma.salesInvoice.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.salesInvoice.findUnique({ where: { id, ...where } }),
    },
  );

  if (!data) notFound();

  // GL-BR-003 K1: cermin guard server updateSalesInvoice fail-closed
  // (cancelled/setelah-pelunasan-nyata pasti ditolak). posted/partial/paid
  // tanpa pelunasan nyata tetap boleh Ubah (fabrication pre-settlement).
  if (data.status === "cancelled") {
    return (
      <LockedEditGuard
        preset={{
          section: "Faktur",
          sectionHref: "/penjualan/faktur",
          documentKind: "Faktur",
          documentNo: data.documentNo,
          slug: data.slug ?? data.id,
          correctionHref: `/penjualan/retur/tambah/faktur/${data.slug ?? data.id}`,
          correctionLabel: "retur penjualan",
          backLabel: "Kembali ke detail faktur",
        }}
      />
    );
  }
  const realSettlementCount = await prisma.salesPayment.count({
    where: {
      salesInvoiceId: data.id,
      NOT: { paymentMethod: "down_payment" },
    },
  });
  if (realSettlementCount > 0) {
    return (
      <LockedEditGuard
        preset={{
          section: "Faktur",
          sectionHref: "/penjualan/faktur",
          documentKind: "Faktur",
          documentNo: data.documentNo,
          slug: data.slug ?? data.id,
          correctionHref: `/penjualan/retur/tambah/faktur/${data.slug ?? data.id}`,
          correctionLabel: "retur penjualan",
          backLabel: "Kembali ke detail faktur",
        }}
      />
    );
  }

  const invoice = {
    id: data.id,
    customerId: data.customerId,
    salesOrderId: data.salesOrderId ?? null,
    date: data.date.toISOString().split("T")[0],
    dueDate: data.dueDate?.toISOString().split("T")[0] ?? null,
    taxInvoiceNumber: data.taxInvoiceNumber ?? null,
    notes: data.notes ?? null,
  };

  const [customers, salesOrders] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.salesOrder.findMany({
      where: { status: { in: ["draft", "confirmed"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Faktur", href: "/penjualan/faktur" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <SalesInvoiceForm
        invoice={invoice}
        customers={customers}
        salesOrders={salesOrders}
      />
    </div>
  );
}
