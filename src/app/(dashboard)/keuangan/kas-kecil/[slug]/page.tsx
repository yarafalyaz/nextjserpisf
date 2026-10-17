export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatDate, formatCurrency } from "@/lib/utils/format";
import { statusLabel } from "@/lib/utils/status-labels";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/ui/delete-button";
import { deletePettyCash } from "@/actions/finance.actions";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { TransactionAttachments } from "@/components/ui/transaction-attachments";
import { Pencil } from "lucide-react";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref } from "@/lib/utils/entity-url";
export const metadata: Metadata = { title: "Kas Kecil" };

export default async function PettyCashDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_petty_cash");

  const { slug } = await params;

  const pettyCash = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.pettyCash.findFirst({
        where: { slug: s },
        include: {
          project: { select: { id: true, name: true, documentNo: true } },
          vendor: { select: { name: true } },
          category: { select: { label: true } },
        },
      }),
      byId: (id) => prisma.pettyCash.findUnique({
        where: { id },
        include: {
          project: { select: { id: true, name: true, documentNo: true } },
          vendor: { select: { name: true } },
          category: { select: { label: true } },
        },
      }),
    },
  );

  if (!pettyCash) notFound();

  const account = pettyCash.accountId
    ? await prisma.account.findUnique({
        where: { id: pettyCash.accountId },
        select: { code: true, name: true },
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Kas Kecil ${pettyCash.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Kas Kecil", href: "/keuangan/kas-kecil" },
          { label: pettyCash.documentNo },
        ]}
        actions={
          <>
            <Button
              href={entityEditHref("/keuangan/kas-kecil", pettyCash)}
              variant="primary"
            >
              <Pencil size={14} /> Ubah
            </Button>
            <DeleteButton id={pettyCash.id} action={deletePettyCash} />
            <BackButton href="/keuangan/kas-kecil" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={pettyCash.documentNo} mono />
        <DetailField label="Tipe" value={statusLabel(pettyCash.type)} />
        <DetailField
          label="Jumlah"
          value={formatCurrency(Number(pettyCash.amount))}
        />
        <DetailField
          label="Saldo Sebelum"
          value={formatCurrency(Number(pettyCash.balanceBefore))}
        />
        <DetailField
          label="Saldo Setelah"
          value={formatCurrency(Number(pettyCash.balanceAfter))}
        />
        <DetailField label="Tanggal" value={formatDate(pettyCash.date)} />
        {pettyCash.accountId && (
          <DetailField
            label="Akun"
            value={
              account
                ? `${account.code} - ${account.name}`
                : `#${pettyCash.accountId}`
            }
          />
        )}
        {pettyCash.description && (
          <DetailField
            label="Deskripsi"
            value={pettyCash.description}
            colSpan="full"
          />
        )}
        {pettyCash.project && (
          <DetailField
            label="Nama Project"
            value={`${pettyCash.project.documentNo ? `${pettyCash.project.documentNo} - ` : ""}${pettyCash.project.name}`}
          />
        )}
        {pettyCash.vendor && (
          <DetailField label="Vendor" value={pettyCash.vendor.name} />
        )}
        {pettyCash.category && (
          <DetailField label="Kategori" value={pettyCash.category.label} />
        )}
        <DetailField label="Dibuat" value={formatDate(pettyCash.createdAt)} />
      </DetailCard>

      <TransactionAttachments
        referenceType="petty_cash"
        referenceId={pettyCash.id}
      />
    </div>
  );
}
