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
import { CreateServicePoButton } from "./_components/create-service-po-button";
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
      customerVehicle: { select: { id: true, licensePlate: true, vehicle: { select: { plateNumber: true, variant: { select: { name: true, model: { select: { name: true, brand: { select: { name: true } } } } } } } } } },
      project: { select: { id: true, name: true } },
      bomRevision: { select: { id: true, revisionNo: true } },
      items: true,
      purchaseOrders: {
        where: { status: { notIn: ["cancelled"] } },
        select: { id: true, documentNo: true, isService: true, grandTotal: true, status: true },
      },
      productionOrders: {
        select: { id: true, documentNo: true, status: true, qty: true },
      },
    },
  });

  if (!wo) notFound();

  // Fetch item names dynamically
  const itemIds = wo.items.map((i) => i.itemId);
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true, isService: true, vendorId: true },
  });
  const itemNameMap = new Map(items.map((i) => [i.id, i.name]));

  // Service items eligible for a service PO (PRD FAB-08 / PUR-17).
  const serviceItems = wo.items
    .map((line) => {
      const meta = items.find((i) => i.id === line.itemId);
      if (!meta?.isService || Number(line.qty) <= 0) return null;
      return {
        itemId: line.itemId,
        name: meta.name,
        qty: Number(line.qty),
        cost: Number(line.cost),
        vendorId: meta.vendorId ?? null,
      };
    })
    .filter((x): x is { itemId: number; name: string; qty: number; cost: number; vendorId: number | null } => x !== null);

  const serviceVendors = await prisma.vendor.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

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
            <CreateServicePoButton
              workOrderId={wo.id}
              serviceItems={serviceItems}
              vendors={serviceVendors}
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
        {wo.customerVehicle && (
          <DetailField
            label="Kendaraan"
            value={
              <Link href={`/master/pelanggan/${wo.customerId}/kendaraan/${wo.customerVehicle.id}`} className="hover:underline">
                {[
                  wo.customerVehicle.vehicle?.variant?.model?.brand?.name,
                  wo.customerVehicle.vehicle?.variant?.model?.name,
                  wo.customerVehicle.vehicle?.variant?.name,
                  wo.customerVehicle.licensePlate ?? wo.customerVehicle.vehicle?.plateNumber,
                ].filter(Boolean).join(" · ") || `Kendaraan #${wo.customerVehicle.id}`}
              </Link>
            }
          />
        )}
        {wo.project && (
          <DetailField
            label="Proyek"
            value={<Link href={`/proyek/${wo.project.id}`} className="hover:underline">{wo.project.name}</Link>}
          />
        )}
        {wo.bomRevision && (
          <DetailField
            label="Revisi BOM"
            value={<Link href={`/produksi/bom-revisi/${wo.bomRevision.id}`} className="hover:underline">Rev. {wo.bomRevision.revisionNo}</Link>}
          />
        )}
      </DetailCard>

      {(wo.purchaseOrders.length > 0 || wo.productionOrders.length > 0) && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Dokumen Terkait</h2>
          </div>
          <div className="p-4 px-5 flex flex-col gap-5">
            {wo.purchaseOrders.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Pesanan Pembelian</p>
                <DetailTable>
                  <DetailTableHead>
                    <DetailTableTh>No. Dokumen</DetailTableTh>
                    <DetailTableTh>Jenis</DetailTableTh>
                    <DetailTableTh align="right">Total</DetailTableTh>
                    <DetailTableTh>Status</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {wo.purchaseOrders.map((p) => (
                      <DetailTableRow key={p.id}>
                        <DetailTableTd className="font-mono"><Link href={`/pembelian/pesanan/${p.id}`}>{p.documentNo}</Link></DetailTableTd>
                        <DetailTableTd>{p.isService ? "Jasa" : "Barang"}</DetailTableTd>
                        <DetailTableTd align="right">{formatCurrency(Number(p.grandTotal))}</DetailTableTd>
                        <DetailTableTd><StatusChip status={p.status} /></DetailTableTd>
                      </DetailTableRow>
                    ))}
                  </DetailTableBody>
                </DetailTable>
              </div>
            )}
            {wo.productionOrders.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Perintah Produksi</p>
                <DetailTable>
                  <DetailTableHead>
                    <DetailTableTh>No. Dokumen</DetailTableTh>
                    <DetailTableTh align="right">Qty</DetailTableTh>
                    <DetailTableTh>Status</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {wo.productionOrders.map((p) => (
                      <DetailTableRow key={p.id}>
                        <DetailTableTd className="font-mono"><Link href={`/produksi/production-orders/${p.id}`}>{p.documentNo}</Link></DetailTableTd>
                        <DetailTableTd align="right">{Number(p.qty)}</DetailTableTd>
                        <DetailTableTd><StatusChip status={p.status} /></DetailTableTd>
                      </DetailTableRow>
                    ))}
                  </DetailTableBody>
                </DetailTable>
              </div>
            )}
          </div>
        </div>
      )}

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
                <DetailTableTh>Nama Barang</DetailTableTh>
                <DetailTableTh>Deskripsi</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
                <DetailTableTh align="right">Biaya/Unit</DetailTableTh>
                <DetailTableTh align="right">Total</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {wo.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{itemNameMap.get(item.itemId) || `Item #${item.itemId}`}</DetailTableTd>
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
