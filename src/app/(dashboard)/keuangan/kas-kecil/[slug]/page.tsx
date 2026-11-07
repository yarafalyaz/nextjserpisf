export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatDate, formatCurrencyExact } from "@/lib/utils/format";
import { statusLabel } from "@/lib/utils/status-labels";
import { notFound } from "next/navigation";
import { VoidButton } from "@/components/ui/void-button";
import { deletePettyCash } from "@/actions/finance.actions";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { TransactionAttachments } from "@/components/ui/transaction-attachments";
import { Pencil } from "lucide-react";

import type { Metadata } from "next";

import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref } from "@/lib/utils/entity-url";
import { CanCreate } from "@/components/auth/can-create";
export const metadata: Metadata = { title: "Kas Kecil" };

export default async function PettyCashDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_petty_cash");

  // delete_petty_cash memakai VoidButton (aksi void beralasan), jadi izinnya
  // dihitung di sini dan dioper sebagai canVoid.
  const canVoidPettyCash = await hasPermission("delete_petty_cash");

  const { slug } = await params;

  const pettyCash = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.pettyCash.findFirst({
        where: { slug: s, ...where },
        include: {
          project: { select: { id: true, name: true, documentNo: true } },
          vendor: { select: { name: true } },
          category: { select: { label: true } },
        },
      }),
      byId: (id, where) => prisma.pettyCash.findUnique({
        where: { id, ...where },
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
            <CanCreate permission="edit_petty_cash">
              <Button
                href={entityEditHref("/keuangan/kas-kecil", pettyCash)}
                variant="primary"
              >
                <Pencil size={14} /> Ubah
              </Button>
            </CanCreate>
            {/* deletePettyCash bukan hapus fisik: ia VOID beralasan (status
                "void" + jurnal asal dipertahankan) dan menolak alasan kosong.
                DeleteButton memanggil action(id) tanpa argumen kedua, jadi
                tombol Hapus di sini selalu gagal "Alasan pembatalan kas kecil
                wajib diisi". VoidButton yang mengumpulkan alasannya. */}
            <VoidButton
              id={pettyCash.id}
              action={deletePettyCash}
              canVoid={canVoidPettyCash}
              requireReason
              label="Batalkan"
              title={`Batalkan transaksi kas kecil ${pettyCash.documentNo}?`}
              body="Transaksi ditandai dibatalkan (void) dan jurnal aslinya dibalik, tetapi barisnya tetap tersimpan untuk jejak audit."
            />
            <BackButton href="/keuangan/kas-kecil" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={pettyCash.documentNo} mono />
        <DetailField label="Tipe" value={statusLabel(pettyCash.type)} />
        <DetailField
          label="Jumlah"
          value={formatCurrencyExact(Number(pettyCash.amount))}
        />
        <DetailField
          label="Saldo Sebelum"
          value={formatCurrencyExact(Number(pettyCash.balanceBefore))}
        />
        <DetailField
          label="Saldo Setelah"
          value={formatCurrencyExact(Number(pettyCash.balanceAfter))}
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
            label="Nama Proyek"
            value={`${pettyCash.project.documentNo ? `${pettyCash.project.documentNo} - ` : ""}${pettyCash.project.name}`}
          />
        )}
        {pettyCash.vendor && (
          <DetailField label="Pemasok" value={pettyCash.vendor.name} />
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
