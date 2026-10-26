export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { SalesReturnForm } from "@/components/forms/sales-return-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { salesInvoiceLabel } from "@/lib/utils/invoice-label";
export const metadata: Metadata = { title: "Ubah Retur" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_sales_returns");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.salesReturn.findFirst({ where: { slug: s, ...where }, include: { items: true } }),
      byId: (id, where) =>
        prisma.salesReturn.findUnique({ where: { id, ...where }, include: { items: true } }),
    },
  );

  if (!data) notFound();

  // `customerId` dan `items` wajib ikut dikirim. Tanpa keduanya form jatuh ke satu
  // baris kosong dan simpan akan menghapus seluruh item retur (aksi menghapus lalu
  // menulis ulang dari daftar yang sudah tersaring kosong), sekaligus gagal karena
  // customerId wajib di skema.
  const returnData = {
    id: data.id,
    customerId: data.customerId,
    salesInvoiceId: data.salesInvoiceId ?? 0,
    date: data.date.toISOString().split("T")[0],
    reason: data.reason,
    taxReturnNoteNumber: data.taxReturnNoteNumber,
    taxReturnNoteDate: data.taxReturnNoteDate ? data.taxReturnNoteDate.toISOString().split("T")[0] : null,
    items: data.items.map((it) => ({
      itemId: it.itemId,
      qty: Number(it.qty),
      serialNumbers: Array.isArray(it.serialNumbers) ? (it.serialNumbers as unknown[]).map(String) : [],
      batchNumbers: Array.isArray(it.batchNumbers) ? (it.batchNumbers as unknown[]).map(String) : [],
    })),
  };

  const [invoices, customers, items] = await Promise.all([
    prisma.salesInvoice.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Retur", href: "/penjualan/retur" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <SalesReturnForm
        returnData={returnData}
        invoices={invoices.map((inv) => ({ ...inv, documentNo: salesInvoiceLabel(inv) }))}
        customers={customers}
        items={items}
      />
    </div>
  );
}
