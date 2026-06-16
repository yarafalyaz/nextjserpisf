export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/ui/status-chip";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteWorkOrder } from "@/actions/manufacturing.actions";
import { WorkOrderActions } from "./_components/work-order-actions";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Perintah Kerja" };

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("view_work_orders");
  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const wo = await prisma.workOrder.findUnique({
    where: { id: numId },
    include: {
      customer: true,
      quotation: true,
      items: true,
    },
  });

  if (!wo) notFound();

  const [completedMi, defaultWarehouse] = await Promise.all([
    prisma.materialIssue.findFirst({
      where: { workOrderId: wo.id, status: "completed" },
      select: { id: true },
    }),
    prisma.warehouse.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const totalCost = wo.items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.cost),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Perintah Kerja ${wo.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Perintah Kerja", href: "/produksi/perintah-kerja" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={wo.status} />}
        actions={
          <>
            <Button
              href={`/produksi/perintah-kerja/${wo.id}/ubah`}
              variant="primary"
            >
              Ubah
            </Button>
            <WorkOrderActions
              workOrderId={wo.id}
              status={wo.status}
              hasCompletedMaterialIssue={!!completedMi}
              defaultWarehouseId={defaultWarehouse?.id ?? null}
            />
            {wo.status === "completed" && wo.quotationId && (
              <Button
                href={`/penjualan/faktur/tambah?quotationId=${wo.quotationId}`}
                variant="primary"
              >
                + Sales Invoice
              </Button>
            )}
            <PrintButton documentType="work-order" documentId={wo.id} />
            <DeleteButton id={wo.id} action={deleteWorkOrder} />
            <BackButton href="/produksi/perintah-kerja" />
          </>
        }
      />

      <DetailCard>
        <DetailField
          label="Pelanggan"
          value={
            <Link href={`/master/pelanggan/${wo.customerId}`}>
              {wo.customer.name}
            </Link>
          }
        />
        <DetailField label="Tanggal" value={formatDate(wo.date)} />
        <DetailField
          label="Penawaran"
          value={
            wo.quotation ? (
              <Link href={`/penjualan/penawaran/${wo.quotationId}`}>
                {wo.quotation.documentNo}
              </Link>
            ) : (
              "-"
            )
          }
          mono
        />
        <DetailField
          label="Total Biaya Material"
          value={formatCurrency(totalCost)}
        />
      </DetailCard>

      {/* Items / Materials */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Materials ({wo.items.length} item)
          </h2>
        </div>
        <div className="p-4 px-5">
          {wo.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              Belum ada material
            </p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>ID Barang</DetailTableTh>
                <DetailTableTh>Deskripsi</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
                <DetailTableTh align="right">Biaya/Unit</DetailTableTh>
                <DetailTableTh align="right">Total</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {wo.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>Item #{item.itemId}</DetailTableTd>
                    <DetailTableTd>{item.description || "-"}</DetailTableTd>
                    <DetailTableTd>
                      <StatusChip status={item.status || "pending"} />
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {Number(item.qty)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatCurrency(Number(item.cost))}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatCurrency(Number(item.qty) * Number(item.cost))}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
              <DetailTableFoot>
                <DetailTableFootRow>
                  <DetailTableTd
                    colSpan={5}
                    align="right"
                    className="font-bold"
                  >
                    Total
                  </DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">
                    {formatCurrency(totalCost)}
                  </DetailTableTd>
                </DetailTableFootRow>
              </DetailTableFoot>
            </DetailTable>
          )}
        </div>
      </div>

      {wo.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={wo.notes} colSpan="full" />
        </DetailCard>
      )}
    </div>
  );
}
