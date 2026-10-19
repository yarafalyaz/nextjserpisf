export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { DownPaymentForm } from "@/components/forms/down-payment-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { getActivePaymentMethods } from "@/lib/services/method.service";
import { loadDownPaymentFormOptions } from "../../_components/down-payment-options";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Uang Muka" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_down_payments");

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) => prisma.downPayment.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.downPayment.findUnique({ where: { id, ...where } }),
    },
  );

  if (!data) notFound();

  const downPayment = {
    id: data.id,
    customerId: data.customerId,
    quotationId: data.quotationId,
    amount: Number(data.amount),
    date: data.paymentDate.toISOString().split("T")[0],
    notes: data.notes,
  };

  const { customers, quotations } = await loadDownPaymentFormOptions({ deletedAt: null });

  const paymentMethods = await getActivePaymentMethods();

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Uang Muka", href: "/penjualan/uang-muka" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <DownPaymentForm
        downPayment={downPayment}
        customers={customers}
        quotations={quotations}
        paymentMethods={paymentMethods}
      />
    </div>
  );
}
