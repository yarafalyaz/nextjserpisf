export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { VendorBillForm } from "@/components/forms/vendor-bill-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Tagihan" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_vendor_bills");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.vendorBill.findFirst({
          where: { slug: s, ...where },
          include: {
            items: {
              select: {
                itemId: true,
                qty: true,
                unitPrice: true,
                discountPercent: true,
                taxPercent: true,
              },
            },
          },
        }),
      byId: (id, where) =>
        prisma.vendorBill.findUnique({
          where: { id, ...where },
          include: {
            items: {
              select: {
                itemId: true,
                qty: true,
                unitPrice: true,
                discountPercent: true,
                taxPercent: true,
              },
            },
          },
        }),
    },
  );

  if (!data) notFound();

  const bill = {
    id: data.id,
    vendorId: data.vendorId,
    purchaseOrderId: data.purchaseOrderId,
    date: data.date.toISOString().split("T")[0],
    dueDate: data.dueDate?.toISOString().split("T")[0] ?? null,
    notes: data.notes,
    vendorInvoiceNumber: data.vendorInvoiceNumber,
    terms: data.terms,
    items: data.items.map((it) => ({
      itemId: it.itemId ?? 0,
      qty: Number(it.qty),
      unitPrice: Number(it.unitPrice),
      discountPercent: Number(it.discountPercent),
      taxPercent: Number(it.taxPercent),
    })),
  };

  const [vendors, items] = await Promise.all([
    prisma.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.item
      .findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          sku: true,
          name: true,
          cost: true,
          unitOfMeasure: true,
        },
      })
      .then((items) => items.map((i) => ({ ...i, cost: Number(i.cost) }))),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Tagihan", href: "/pembelian/tagihan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <VendorBillForm bill={bill} vendors={vendors} items={items} />
    </div>
  );
}
