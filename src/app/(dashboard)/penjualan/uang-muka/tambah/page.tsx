export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
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
  await requirePermission("create_down_payments");

  const params = await searchParams;
  let quotationId = params.quotationId
    ? Number(params.quotationId)
    : undefined;

  // Tautan dari detail Pesanan Penjualan mengirim ?salesOrderId=. Uang muka
  // tertaut ke PENAWARAN, jadi pesanan itu diterjemahkan ke penawarannya.
  // Sebelumnya parameter ini ada di tipe tapi diabaikan — tautan mati.
  if (!quotationId && params.salesOrderId) {
    const so = await prisma.salesOrder.findUnique({
      where: { id: Number(params.salesOrderId) },
      select: { quotationId: true },
    });
    if (so?.quotationId) quotationId = so.quotationId;
  }

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
          { label: "Penjualan", href: "/penjualan" },
          { label: "Uang Muka", href: "/penjualan/uang-muka" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Uang Muka</h1>
      </div>
      {quotations.length === 0 && (
        <Alert>
          <AlertTitle>Belum ada penawaran yang bisa dipakai</AlertTitle>
          <AlertDescription>
            Uang muka penjualan hanya bisa dibuat dari Penawaran berstatus{" "}
            <strong>Diterima</strong> atau <strong>Disetujui</strong>. Penawaran yang baru
            dibuat selalu berstatus konsep — setujui dulu lewat tombol{}
            <strong>Setujui</strong> di halaman detail penawaran.
          </AlertDescription>
        </Alert>
      )}
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
