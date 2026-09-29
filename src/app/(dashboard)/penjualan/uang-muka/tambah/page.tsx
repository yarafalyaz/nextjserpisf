export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { DownPaymentForm } from "@/components/forms/down-payment-form";
import { getActivePaymentMethods } from "@/lib/services/method.service";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
export const metadata: Metadata = { title: "Tambah Uang Muka" };

export default async function CreateDownPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ quotationId?: string; salesOrderId?: string }>;
}) {
  await requirePermission("edit_sales_orders");

  const params = await searchParams;
  const quotationId = params.quotationId
    ? Number(params.quotationId)
    : undefined;

  const [customersList, quotationsList, paymentMethods] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
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
    getActivePaymentMethods(),
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

  // Pre-fill from quotation if provided
  const preselectedQuotation = quotationId
    ? quotations.find((q) => q.id === quotationId)
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan/pesanan" },
          { label: "Uang Muka", href: "/penjualan/uang-muka" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Uang Muka</h1>
      </div>
      <DownPaymentForm
        customers={customers}
        quotations={quotations}
        defaultQuotationId={quotationId}
        defaultCustomerId={preselectedQuotation?.customerId}
        paymentMethods={paymentMethods}
      />
    </div>
  );
}
