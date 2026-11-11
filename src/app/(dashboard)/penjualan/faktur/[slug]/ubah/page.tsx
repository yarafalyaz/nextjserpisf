export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { SalesInvoiceForm } from "@/components/forms/sales-invoice-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { LockedEditGuard } from "@/components/ui/locked-edit-guard";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { DELIVERABLE_ORDER_STATUSES } from "@/lib/validations/sales.schemas";
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

  // Putaran 110: baris tersimpan wajib dimuat ke form. Tanpa initialItems,
  // tabel item di halaman Ubah tampil kosong; simpan lalu menjalankan
  // deleteMany + createMany di updateSalesInvoice sehingga menambah satu baris
  // MENGHAPUS seluruh baris lama, dan PPN jatuh ke 0% karena taxRate state
  // default 0. UoM/serial/deskripsi juga ikut karena jalur edit menulis ulang
  // baris dari payload form.
  const [customers, salesOrders, storedItems, availableItems] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        paymentTerm: { select: { days: true, isActive: true } },
      },
    }).then((rows) => rows.map((c) => ({
      id: c.id,
      name: c.name,
      paymentTermDays: c.paymentTerm?.isActive ? c.paymentTerm.days : null,
    }))),
    prisma.salesOrder.findMany({
      // Satu sumber dengan gerbang server updateSalesInvoice
      // (DELIVERABLE_ORDER_STATUSES) + pesanan yang sekarang tertaut, supaya
      // tautan lama berstatus lain tetap tampil di pemilih.
      where: data.salesOrderId
        ? {
            OR: [
              { status: { in: [...DELIVERABLE_ORDER_STATUSES] } },
              { id: data.salesOrderId },
            ],
          }
        : { status: { in: [...DELIVERABLE_ORDER_STATUSES] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.salesInvoiceItem.findMany({
      where: { salesInvoiceId: data.id },
      orderBy: { id: "asc" },
      select: {
        itemId: true,
        description: true,
        qty: true,
        unitPrice: true,
        discount: true,
        uom: true,
        serialNumbers: true,
      },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, price: true, isScrapSaleItem: true },
    }),
  ]);

  const initialItems = storedItems.map((item) => ({
    itemId: item.itemId,
    description: item.description,
    qty: Number(item.qty),
    unitPrice: Number(item.unitPrice),
    discount: Number(item.discount),
    uom: item.uom,
    serialNumbers: Array.isArray(item.serialNumbers)
      ? (item.serialNumbers as unknown[]).map((s) => String(s))
      : null,
  }));
  // Tarif diturunkan dari nominal tersimpan (pola halaman detail): `tax` bisa
  // berarti nominal ATAU tarif tergantung jalur tulis, sedangkan taxAmount
  // selalu nominal. Dasar pengenaan = subtotal - diskon header.
  const taxBase = Number(data.subtotal ?? 0) - Number(data.discount ?? 0);
  const initialTaxRate = taxBase > 0
    ? Math.round((Number(data.taxAmount ?? 0) / taxBase) * 10000) / 100
    : 0;

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
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Faktur</h1>
      </div>
      <SalesInvoiceForm
        invoice={invoice}
        customers={customers}
        salesOrders={salesOrders}
        initialItems={initialItems}
        initialTaxRate={initialTaxRate}
        availableItems={availableItems.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          price: Number(item.price),
          isScrapSaleItem: item.isScrapSaleItem,
        }))}
      />
    </div>
  );
}
