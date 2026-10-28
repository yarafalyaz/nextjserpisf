export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { PaymentForm } from "@/components/forms/payment-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { LockedEditGuard } from "@/components/ui/locked-edit-guard";
import { getActivePaymentMethods } from "@/lib/services/method.service";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { salesInvoiceLabel } from "@/lib/utils/invoice-label";
export const metadata: Metadata = { title: "Ubah Pembayaran" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_sales_payments");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) => prisma.salesPayment.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.salesPayment.findUnique({ where: { id, ...where } }),
    },
  );

  if (!data) notFound();

  // GL-BR-003 K1: pembayaran reversed = histori read-only (server tolak
  // edit reversed fail-closed). Jangan render form — tampilkan notice +
  // tautan kembali, bukan aksi yang pasti ditolak.
  if (data.status === "reversed") {
    return (
      <LockedEditGuard
        crumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Pembayaran", href: "/penjualan/pembayaran" },
          { label: "Ubah" },
        ]}
        documentLabel={`Pembayaran ${data.documentNo}`}
        correctionLabel="pembayaran pengganti baru"
        backHref="/penjualan/pembayaran"
        backLabel="Kembali ke daftar pembayaran"
      />
    );
  }

  const payment = {
    id: data.id,
    salesInvoiceId: data.salesInvoiceId ?? undefined,
    amount: Number(data.amount),
    paymentDate: data.paymentDate.toISOString().split("T")[0],
    paymentMethod: data.paymentMethod ?? "",
    notes: data.notes ?? "",
    withholdingTypeId: data.withholdingTypeId ?? undefined,
    withholdingAmount: Number(data.withholdingAmount ?? 0),
    withholdingCertificateNo: data.withholdingCertificateNo ?? "",
    withholdingDate: data.withholdingDate
      ? data.withholdingDate.toISOString().split("T")[0]
      : "",
  };

  const [invoices, accounts] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { not: "paid" } },
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.account.findMany({
      where: { type: "ASSET" },
      orderBy: { code: "asc" },
    }),
  ]);
  const paymentMethods = await getActivePaymentMethods();
  const withholdingTypes = await prisma.withholdingTaxType.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, rate: true },
    orderBy: { code: "asc" },
  });

  const invoiceOptions = invoices.map((inv) => ({
    id: inv.id,
    documentNo: salesInvoiceLabel(inv),
    grandTotal: String(inv.grandTotal),
    paidAmount: String(inv.paidAmount),
    customer: { name: inv.customer.name },
  }));

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembayaran", href: "/penjualan/pembayaran" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <PaymentForm
        payment={payment}
        invoices={invoiceOptions}
        accounts={accounts}
        paymentMethods={paymentMethods}
        withholdingTypes={withholdingTypes.map((type) => ({ ...type, rate: Number(type.rate) }))}
      />
    </div>
  );
}
