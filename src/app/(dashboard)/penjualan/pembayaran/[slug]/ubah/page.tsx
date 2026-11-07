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
import { UNPAYABLE_SALES_INVOICE_STATUSES } from "@/lib/constants/status";
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
        preset={{
          section: "Pembayaran",
          sectionHref: "/penjualan/pembayaran",
          documentKind: "Pembayaran",
          documentNo: data.documentNo,
          slug: data.slug ?? data.id,
          correctionLabel: "pembayaran pengganti baru",
          backHref: "/penjualan/pembayaran",
          backLabel: "Kembali ke daftar pembayaran",
        }}
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
      // Picker dan updateSalesPayment membaca daftar yang SAMA. Dulu picker
      // memakai `not: "paid"`, sehingga faktur draft/approved/cancelled
      // ditawarkan padahal action selalu menolaknya ("sudah diposting").
      where: { status: { notIn: [...UNPAYABLE_SALES_INVOICE_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.account.findMany({
      where: { isActive: true, deletedAt: null, reportGroup: "BANK" },
      orderBy: { code: "asc" },
    }),
  ]);
  const paymentMethods = await getActivePaymentMethods();
  const withholdingTypes = await prisma.withholdingTaxType.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, rate: true },
    orderBy: { code: "asc" },
  });

  // Faktur yang SUDAH tertaut wajib tetap tampil walau statusnya kini `paid`
  // (dilunasi pembayaran ini sendiri) — tanpa fallback, Combobox kosong dan
  // menyimpan ulang menghapus tautannya diam-diam.
  const linkedInvoice =
    data.salesInvoiceId && !invoices.some((inv) => inv.id === data.salesInvoiceId)
      ? await prisma.salesInvoice.findUnique({
          where: { id: data.salesInvoiceId },
          include: { customer: { select: { name: true } } },
        })
      : null

  const invoiceOptions = (linkedInvoice ? [linkedInvoice, ...invoices] : invoices).map((inv) => ({
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
