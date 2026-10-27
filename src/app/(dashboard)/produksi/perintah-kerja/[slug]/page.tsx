export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/ui/status-chip";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteWorkOrder } from "@/actions/manufacturing.actions";
import { WorkOrderActions } from "./_components/work-order-actions";
import { JobReopenButton } from "@/components/reports/job-reopen-button";
import { WorkOrderOperationActions, InitializeStagesButton, WorkOrderOperationWorkCenterSelect } from "./_components/work-order-operation-actions";
import { getWorkCenters } from "@/lib/reports/work-center-load-plan-data";
import { CreateServicePoButton } from "./_components/create-service-po-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { TransactionAttachments } from "@/components/ui/transaction-attachments";
import { getWorkOrderPhotos } from "@/lib/reports/attachment-photo-data";
import {
  WorkOrderPhotoPanel,
  isPublishableCategory,
} from "@/components/reports/work-order-photo-panel";
import { PhotoUploadField } from "@/components/reports/photo-upload-field";
import { PhotoVerifyPublishButtons } from "@/components/reports/photo-verify-publish-button";
import { WhatsappButton } from "@/components/reports/whatsapp-button";
import { WhatsappTrailNote } from "@/components/reports/whatsapp-trail-note";
import { getWhatsappTrail } from "@/lib/reports/whatsapp-trail-data";
import { buildWhatsappMessage } from "@/lib/utils/whatsapp";
import { WorkOrderMaterialNeedsCard } from "@/components/reports/work-order-material-needs-card";
import { getWorkOrderMaterialNeeds } from "@/lib/reports/work-order-material-needs-data";
import { WorkOrderPartStatusCard } from "@/components/reports/work-order-part-status-card";
import { WorkOrderSubstituteSuggestionsPanel } from "@/components/reports/work-order-substitute-suggestions-panel";
import { getWorkOrderSubstituteSuggestions } from "@/lib/reports/item-substitute-suggestions-data";
import { FitmentBadge, FitmentIncompatibleSummary } from "@/components/reports/fitment-badge";
import { getWorkOrderPartStatus } from "@/lib/reports/work-order-part-status-data";
import { WorkOrderReservationsCard } from "@/components/reports/work-order-reservations-card";
import { getWorkOrderReservations } from "@/lib/reports/work-order-reservations-data";
import { WorkOrderProgressCard } from "@/components/reports/work-order-progress-card";
import { getWorkOrderProgress } from "@/lib/reports/work-order-progress-data";
import { getJobChangeOrdersForWorkOrder } from "@/actions/job-change-order.actions";
import { JobChangeOrderPanel } from "./_components/job-change-order-panel";
import { listBomRevisionChangeRequests } from "@/actions/bom-revision-change.actions";
import { BomRevisionChangePanel } from "@/components/reports/bom-revision-change-panel";
import { BomRevisionImpactCard } from "@/components/reports/bom-revision-impact-card";
import { loadBomRevisionImpact } from "@/lib/reports/bom-revision-impact-data";
import { auth } from "@/lib/auth/auth";
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
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityHref, entityEditHref, entityNestedHref } from "@/lib/utils/entity-url";
import { CanCreate } from "@/components/auth/can-create";

export const metadata: Metadata = { title: "Perintah Kerja" };

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_work_orders");
  const { slug } = await params;

  const workOrderInclude = {
    customer: true,
    quotation: true,
    customerVehicle: { select: { id: true, slug: true, plateNumber: true, vehicle: { select: { variant: { select: { name: true, model: { select: { name: true, brand: { select: { name: true } } } } } } } } } },
    project: { select: { id: true, name: true, slug: true } },
    bomRevision: { select: { id: true, revisionNo: true, slug: true } },
    items: true,
    purchaseOrders: {
      where: { status: { notIn: ["cancelled"] } },
      select: { id: true, documentNo: true, isService: true, grandTotal: true, status: true, slug: true },
    },
    productionOrders: {
      select: { id: true, documentNo: true, status: true, qty: true, slug: true, bomRevision: { select: { revisionNo: true } } },
    },
  };

  const wo = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.workOrder.findFirst({
          where: { slug: s },
          include: workOrderInclude,
        }),
      byId: (id) =>
        prisma.workOrder.findUnique({
          where: { id },
          include: workOrderInclude,
        }),
    },
  );

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

  const [completedMi, defaultWarehouse, linkedProducts, materialIssues, vehicleIntake, vehicleHandover] = await Promise.all([
    prisma.materialIssue.findFirst({
      where: { workOrderId: wo.id, status: "completed" },
      select: { id: true },
    }),
    prisma.warehouse.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    // Produk manufaktur yang item jadinya dipakai WO ini: kalau tepat satu, produk
    // itu ikut dibawa ke form perintah produksi ("buat dari" jadi satu klik).
    wo.items.length > 0
      ? prisma.product.findMany({
          where: { inventoryItemId: { in: wo.items.map((i) => i.itemId) } },
          select: { id: true, slug: true },
        })
      : Promise.resolve([] as { id: number; slug: string | null }[]),
    // Semua pengeluaran material yang lahir dari WO ini. Tombol "Buat
    // Pengeluaran Material" menulis MI langsung lewat aksi (tanpa lewat
    // halaman tambah), jadi tanpa daftar ini hasilnya tak terlihat dari sini —
    // pengguna harus menebak lewat menu Inventaris.
    prisma.materialIssue.findMany({
      where: { workOrderId: wo.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true, status: true, slug: true },
    }),
    // F-50(b): status inspeksi masuk kendaraan — gate mulai F-50(a) tampil di
    // UI (field + tombol nonaktif), bukan hanya error sesudah klik.
    wo.customerVehicleId
      ? prisma.qcInspection.findFirst({
          where: { referenceType: "WorkOrder", referenceId: wo.id, inspectionType: "vehicle_intake" },
          orderBy: { createdAt: "desc" },
          select: { id: true, documentNo: true, status: true, slug: true },
        })
      : Promise.resolve(null),
    // F-50 slice serah terima (tampilan saja, bukan gate baru): status inspeksi
    // serah terima kendaraan tampil sejajar "Inspeksi Masuk". Backend
    // assertQcCleared menolak NCR terbuka/inspeksi akhir non-passed;
    // vehicle_handover sendiri tidak dibaca gate backend mana pun, jadi field
    // ini display-only dan tidak memblokir penyelesaian.
    wo.customerVehicleId
      ? prisma.qcInspection.findFirst({
          where: { referenceType: "WorkOrder", referenceId: wo.id, inspectionType: "vehicle_handover" },
          orderBy: { createdAt: "desc" },
          select: { id: true, documentNo: true, status: true, slug: true },
        })
      : Promise.resolve(null),
  ]);

  const suggestedProduct = linkedProducts.length === 1 ? linkedProducts[0] : null;

  const materialNeeds = await getWorkOrderMaterialNeeds(wo.id);

  // F-105: status part turunan read-only per baris WO (builder Bara PR #275).
  // Kartu murni presentasi: tanpa hitung ulang, tanpa tulis WorkOrderItem.status.
  const partStatus = await getWorkOrderPartStatus(wo.id);

  // F-2026-10-22-069-S: saran substitusi read-only dari loader BOT 3 —
  // tampil verbatim; terapkan digerbang edit_work_orders (server menegakkan).
  const [substituteSuggestions, canApplySubstitute] = await Promise.all([
    getWorkOrderSubstituteSuggestions(wo.id),
    hasPermission("edit_work_orders"),
  ]);

  // F-057-S §2/§3: tabel reservasi stok — baris StockReservation passthrough
  // loader (status/sisa builder, jejak rilis apa adanya). Izin view_work_orders
  // sudah digerbang di atas. Q-RIL-1 saring per gudang belum diputus — loader
  // tidak menyaring, kartu menampilkan semua baris apa adanya.
  const reservations = await getWorkOrderReservations(wo.id);

  // F-020-B: progres tahap WO dari builder Bara (PR #377) — tampil apa adanya.
  // Aksi tahap hanya dirender bila izin edit_work_orders; server penegak.
  const stageProgress = await getWorkOrderProgress(wo.id);
  const canEditStages = await hasPermission("edit_work_orders");
  // F-2026-10-21-009-V: izin tombol reopen job closed = izin server reopenWorkOrder.
  const canReopenWorkOrder = await hasPermission("complete_work_orders");
  // F-090-S: pilihan stasiun tahap dari master WorkCenter (BOT 3 PR #569).
  const workCenters = canEditStages ? await getWorkCenters() : [];

  // F-036 tahap 2 + F-035: jejak klik WA terakhir + histori geser endDate.
  const whatsappTrail = await getWhatsappTrail("WorkOrder", wo.id);

  // F-2026-10-24-096-S: foto per tahap dari loader backend (grup/kategori/
  // before-after apa adanya). Tombol aksi hanya pemegang izin; server penegak.
  const [workOrderPhotos, canVerifyPhoto, canPublishPhoto, canEditWo] =
    await Promise.all([
      getWorkOrderPhotos(wo.id),
      hasPermission("manage_qc_inspections"),
      hasPermission("complete_work_orders"),
      hasPermission("edit_work_orders"),
    ]);
  const canUploadQcPhoto = canVerifyPhoto;

  // F-066-S UI (t_b1b321cb): panel Change Order — konsumen 7 aksi BOT 3.
  // Nilai kontrak tunggal dari quotation berjalan (BR-CO-01); daftar item
  // master hanya opsi baris tambah (harga awal dari master, server snapshot).
  const [changeOrders, inventoryItemOptions, canCreateCo, canEditCo, canApplyCo] =
    await Promise.all([
      getJobChangeOrdersForWorkOrder(wo.id),
      prisma.item.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true, price: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
      hasPermission("create_work_orders"),
      hasPermission("edit_work_orders"),
      hasPermission("complete_work_orders"),
    ]);

  // F-068-S UI (t_b60d664d): panel ganti revisi BOM — konsumen aksi BOT 3
  // PR #589. Opsi = revisi released produk pin saat ini (beda dari pin);
  // daftar pengajuan dari aksi list existing. Nama pengaju/item dari sini.
  const [bomChangeList, canManageBomChange, bomSession] = await Promise.all([
    listBomRevisionChangeRequests({ workOrderId: wo.id }),
    hasPermission("edit_work_orders"),
    auth(),
  ]);
  const bomChangeRequests = bomChangeList.success ? bomChangeList.requests : [];
  const bomRevisionOptions = wo.bomRevision
    ? await prisma.bomRevision.findMany({
        where: {
          productId: (
            await prisma.bomRevision.findFirst({
              where: { id: wo.bomRevision.id },
              select: { productId: true },
            })
          )?.productId,
          status: "released",
          id: { not: wo.bomRevision.id },
        },
        select: { id: true, revisionNo: true },
        orderBy: { revisionNo: "asc" },
      })
    : [];
  const bomRevIds = [
    ...new Set([
      ...(wo.bomRevision ? [wo.bomRevision.id] : []),
      ...bomRevisionOptions.map((r) => r.id),
      ...bomChangeRequests.flatMap((r) => [r.fromRevisionId, r.toRevisionId]),
    ]),
  ];
  const bomRevRows = bomRevIds.length
    ? await prisma.bomRevision.findMany({
        where: { id: { in: bomRevIds } },
        select: { id: true, revisionNo: true, materials: { select: { itemId: true } } },
      })
    : [];
  const bomUserIds = [
    ...new Set(
      bomChangeRequests.flatMap((r) => [r.requestedBy, r.decidedBy]).filter((x): x is number => x != null),
    ),
  ];
  const bomUserRows = bomUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: bomUserIds } }, select: { id: true, name: true } })
    : [];
  const bomItemIds = [...new Set(bomRevRows.flatMap((r) => r.materials.map((m) => m.itemId)))];
  const bomItemRows = bomItemIds.length
    ? await prisma.item.findMany({ where: { id: { in: bomItemIds } }, select: { id: true, name: true } })
    : [];

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
            <CanCreate permission="edit_work_orders">
              <Button
                href={entityEditHref("/produksi/perintah-kerja", wo)}
                variant="primary"
              >
                Ubah
              </Button>
            </CanCreate>
            {/* WO -> Perintah Produksi: satu-satunya jalur yang mengisi
                `ProductionOrder.workOrderId` (form manual tak punya input WO).
                Selalu tampil — satu WO boleh punya beberapa perintah produksi
                (produksi parsial), jadi turunannya bukan tunggal. */}
            <CanCreate permission="create_production_orders">
              <Button
                href={`/produksi/production-orders/tambah/perintah-kerja/${wo.slug ?? wo.id}${suggestedProduct ? `/produk/${suggestedProduct.slug ?? suggestedProduct.id}` : ""}`}
                variant="secondary"
              >
                + Perintah Produksi
              </Button>
            </CanCreate>
            {/* F-2026-10-21-009-V: reopen job closed — izin sama dengan
                penegakan server reopenWorkOrder (complete_work_orders). */}
            <JobReopenButton
              kind="work_order"
              id={wo.id}
              code={wo.documentNo}
              status={wo.status}
              canReopen={canReopenWorkOrder}
            />
            <WorkOrderActions
              workOrderId={wo.id}
              status={wo.status}
              hasCompletedMaterialIssue={!!completedMi}
              defaultWarehouseId={defaultWarehouse?.id ?? null}
              vehicleIntakeBlocked={!!wo.customerVehicleId && !vehicleIntake}
              vehicleIntakeHref={`/produksi/qc/inspeksi/tambah/perintah-kerja/${wo.slug ?? wo.id}/tipe/vehicle_intake`}
              pendingStageCount={stageProgress?.pendingCount}
              revisableItems={wo.items
                .filter((i) => i.status !== "replaced")
                .map((i) => ({ id: i.id, label: itemNameMap.get(i.itemId) || `Barang #${i.itemId}` }))}
            />
            <CanCreate permission="create_purchase_orders">
              <CreateServicePoButton
                workOrderId={wo.id}
                serviceItems={serviceItems}
                vendors={serviceVendors}
              />
            </CanCreate>
            {wo.status === "completed" && wo.quotationId && (
              <CanCreate permission="create_sales_invoices">
                <Button
                  href={`/penjualan/faktur/tambah/penawaran/${wo.quotation?.slug ?? wo.quotationId}`}
                  variant="primary"
                >
                  + Faktur Penjualan
                </Button>
              </CanCreate>
            )}
            <WhatsappButton
              phone={wo.customer.phone}
              modelType="WorkOrder"
              modelId={wo.id}
              surface="detail"
              message={buildWhatsappMessage({
                customerName: wo.customer.name,
                documentLabel: "Perintah Kerja",
                documentNo: wo.documentNo,
                status: wo.status,
                plateNumber: wo.customerVehicle?.plateNumber,
                estimatedEndDate: wo.endDate,
              })}
            />
            <PrintButton documentType="work-order" documentId={wo.id} />
            <CanCreate permission="delete_work_orders">
              <DeleteButton id={wo.id} action={deleteWorkOrder} />
            </CanCreate>
            <BackButton href="/produksi/perintah-kerja" />
          </>
        }
      />

      <DetailCard>
        <DetailField
          label="Pelanggan"
          value={
            <Link href={entityHref("/master/pelanggan", wo.customer)}>
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
          label="Total Biaya Bahan"
          value={formatCurrency(totalCost)}
        />
        {wo.customerVehicle && (
          <DetailField
            label="Kendaraan"
            value={
              <Link href={entityNestedHref("/master/pelanggan", wo.customer, "kendaraan", wo.customerVehicle)} className="hover:underline">
                {[
                  wo.customerVehicle.vehicle?.variant?.model?.brand?.name,
                  wo.customerVehicle.vehicle?.variant?.model?.name,
                  wo.customerVehicle.vehicle?.variant?.name,
                  wo.customerVehicle.plateNumber,
                ].filter(Boolean).join(" · ") || `Kendaraan #${wo.customerVehicle.id}`}
              </Link>
            }
          />
        )}
        {wo.customerVehicle && (
          <DetailField
            label="Inspeksi Masuk"
            value={
              vehicleIntake ? (
                <Link href={entityHref("/produksi/qc/inspeksi", vehicleIntake)} className="hover:underline">
                  {vehicleIntake.documentNo} — tercatat
                </Link>
              ) : (
                <Link
                  href={`/produksi/qc/inspeksi/tambah/perintah-kerja/${wo.slug ?? wo.id}/tipe/vehicle_intake`}
                  className="hover:underline"
                >
                  Belum tercatat — buat inspeksi masuk
                </Link>
              )
            }
          />
        )}
        {wo.customerVehicle && (
          <DetailField
            label="Inspeksi Serah Terima"
            value={
              vehicleHandover ? (
                <Link href={entityHref("/produksi/qc/inspeksi", vehicleHandover)} className="hover:underline">
                  {vehicleHandover.documentNo} — tercatat
                </Link>
              ) : (
                <Link
                  href={`/produksi/qc/inspeksi/tambah/perintah-kerja/${wo.slug ?? wo.id}/tipe/vehicle_handover`}
                  className="hover:underline"
                >
                  Belum tercatat — buat inspeksi serah terima
                </Link>
              )
            }
          />
        )}
        {wo.project && (
          <DetailField
            label="Proyek"
            value={<Link href={entityHref("/proyek", wo.project)} className="hover:underline">{wo.project.name}</Link>}
          />
        )}
        {wo.bomRevision && (
          <DetailField
            label="Revisi BOM"
            value={<Link href={entityHref("/produksi/bom-revisi", wo.bomRevision)} className="hover:underline">Rev. {wo.bomRevision.revisionNo}</Link>}
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
                        <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/pesanan", p)}>{p.documentNo}</Link></DetailTableTd>
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
                    <DetailTableTh align="right">Kuantitas</DetailTableTh>
                    <DetailTableTh>Status</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {wo.productionOrders.map((p) => (
                      <DetailTableRow key={p.id}>
                        <DetailTableTd className="font-mono"><Link href={entityHref("/produksi/production-orders", p)}>{p.documentNo}</Link></DetailTableTd>
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

      {stageProgress ? (
        <>
          {!canEditStages && wo.status === "in_progress" && stageProgress.hasStages ? (
            <p className="text-sm text-muted-foreground">
              Hanya pengguna berizin edit_work_orders yang dapat mengubah
              progres tahap.
            </p>
          ) : null}
          <WorkOrderProgressCard
            progress={stageProgress}
            actions={
              canEditStages && wo.status === "in_progress"
                ? Object.fromEntries(
                    stageProgress.rows.map((row) => [
                      row.id,
                      <span key={row.id} className="flex flex-col items-end gap-2">
                        <WorkOrderOperationActions
                          workOrderId={wo.id}
                          workOrderStatus={wo.status}
                          row={row}
                        />
                        <WorkOrderOperationWorkCenterSelect
                          workOrderId={wo.id}
                          row={row}
                          centers={workCenters}
                        />
                      </span>,
                    ]),
                  )
                : undefined
            }
            initAction={
              canEditStages && wo.status === "in_progress"
                ? <InitializeStagesButton workOrderId={wo.id} />
                : undefined
            }
          />
        </>
      ) : null}

      {materialNeeds ? <WorkOrderMaterialNeedsCard needs={materialNeeds} /> : null}

      {partStatus ? (
        <WorkOrderPartStatusCard report={partStatus} nameByItemId={itemNameMap} />
      ) : null}

      {substituteSuggestions ? (
        <WorkOrderSubstituteSuggestionsPanel
          workOrderId={wo.id}
          report={substituteSuggestions}
          canApply={canApplySubstitute}
        />
      ) : null}

      {wo.bomRevision ? (
        <BomRevisionImpactCard
          impact={await loadBomRevisionImpact(wo.bomRevision.id)}
          currentRevisionNo={wo.bomRevision.revisionNo}
        />
      ) : null}

      <BomRevisionChangePanel
        owner={{ workOrderId: wo.id }}
        documentStatus={wo.status}
        currentRevision={wo.bomRevision}
        revisionOptions={bomRevisionOptions}
        requests={bomChangeRequests}
        revisionNoById={Object.fromEntries(bomRevRows.map((r) => [r.id, r.revisionNo]))}
        userNameById={Object.fromEntries(bomUserRows.map((u) => [u.id, u.name]))}
        itemNameById={Object.fromEntries(bomItemRows.map((i) => [i.id, i.name]))}
        canManage={canManageBomChange}
        currentUserId={bomSession?.user?.id ? Number(bomSession.user.id) : null}
        pairedPins={wo.productionOrders.flatMap((po) =>
          po.bomRevision
            ? [{ label: "order produksi", documentNo: po.documentNo, revisionNo: po.bomRevision.revisionNo }]
            : [],
        )}
      />

      <JobChangeOrderPanel
        workOrderId={wo.id}
        workOrderStatus={wo.status}
        hasQuotation={!!wo.quotationId}
        contractGrandTotal={wo.quotation ? Number(wo.quotation.grandTotal) : null}
        changeOrders={changeOrders}
        workOrderItems={wo.items
          .filter((i) => i.status !== "replaced")
          .map((i) => ({
            workOrderItemId: i.id,
            itemId: i.itemId,
            label: itemNameMap.get(i.itemId) || `Barang #${i.itemId}`,
            qty: Number(i.qty),
            cost: Number(i.cost),
          }))}
        inventoryItems={inventoryItemOptions.map((i) => ({
          id: i.id,
          label: i.name,
          price: Number(i.price),
        }))}
        itemNameById={Object.fromEntries(itemNameMap)}
        canCreate={canCreateCo}
        canEdit={canEditCo}
        canApply={canApplyCo}
      />
      {reservations ? <WorkOrderReservationsCard reservations={reservations} /> : null}

      <WhatsappTrailNote trail={whatsappTrail} />

      {/* Pengeluaran material yang lahir dari WO ini. SELALU tampil: tombol
          "Buat Pengeluaran Material" menulis MI langsung lewat aksi (tanpa
          lewat halaman tambah), jadi tanpa kartu ini hasilnya tak terlihat
          dari sini. */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Pengeluaran Material</h2>
          {wo.status === "in_progress" && !completedMi && (
            <CanCreate permission="create_material_issues">
              <Button
                href={`/inventaris/pengeluaran-material/tambah/perintah-kerja/${wo.slug ?? wo.id}`}
                variant="secondary"
              >
                + Pengeluaran Material
              </Button>
            </CanCreate>
          )}
        </div>
        <div className="p-4 px-5">
          {materialIssues.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              Belum ada pengeluaran material untuk perintah kerja ini
            </p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Dokumen</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {materialIssues.map((mi) => (
                  <DetailTableRow key={mi.id}>
                    <DetailTableTd className="font-mono">
                      <Link href={entityHref("/inventaris/pengeluaran-material", mi)}>
                        {mi.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip status={mi.status} />
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      {/* Items / Materials */}
      {/* F-063-S: ringkasan snapshot fitment tersimpan server (bukan
          evaluasi ulang); 0 incompatible → senyap. */}
      <FitmentIncompatibleSummary
        incompatibleCount={wo.items.filter((i) => i.fitmentResult === "incompatible").length}
      />
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Bahan ({wo.items.length} barang)
          </h2>
        </div>
        <div className="p-4 px-5">
          {wo.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              Belum ada bahan
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
                    <DetailTableTd>
                      <div className="flex flex-col">
                        <span>{itemNameMap.get(item.itemId) || `Barang #${item.itemId}`}</span>
                        <FitmentBadge
                          fitmentResult={item.fitmentResult}
                          fitmentRuleId={item.fitmentRuleId}
                        />
                      </div>
                    </DetailTableTd>
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

      {/* Foto bukti WO: izin work_order sudah terpetakan (view_work_orders
          baca, edit_work_orders tulis) di attachment-permission-maps. */}
      <TransactionAttachments referenceType="work_order" referenceId={wo.id} />

      {/* F-2026-10-24-096-S: foto per tahap berkategori (loader backend).
          Panel existing di atas tidak dibangun ulang. */}
      <WorkOrderPhotoPanel
        photos={workOrderPhotos}
        actions={Object.fromEntries(
          workOrderPhotos.groups.flatMap((g) =>
            g.photos.map((p) => [
              p.id,
              <PhotoVerifyPublishButtons
                key={p.id}
                attachmentId={p.id}
                photoName={p.originalName}
                isVerified={p.isVerified}
                canVerify={canVerifyPhoto}
                canPublish={canPublishPhoto}
                publishable={isPublishableCategory(p.category)}
              />,
            ]),
          ),
        )}
        uploads={
          canEditWo || canUploadQcPhoto ? (
            <div className="flex flex-col gap-3 border-t border-default pt-4">
              <h3 className="text-sm font-semibold text-foreground">Upload Foto Tahap</h3>
              {canEditWo ? (
                <PhotoUploadField
                  referenceType="work_order"
                  referenceId={wo.id}
                  parentLabel="Perintah kerja"
                />
              ) : null}
              {workOrderPhotos.groups
                .filter((g) => g.referenceType !== "work_order")
                .map((g) =>
                  (g.referenceType === "qc_inspection" ? canUploadQcPhoto : canEditWo) ? (
                    <PhotoUploadField
                      key={`${g.referenceType}:${g.referenceId}`}
                      referenceType={g.referenceType}
                      referenceId={g.referenceId}
                      parentLabel={g.parentLabel ?? `${g.referenceType} #${g.referenceId}`}
                    />
                  ) : null,
                )}
              {wo.customerVehicleId ? (
                <p className="text-xs text-muted-foreground">
                  Foto kendaraan umum diunggah dari halaman kendaraan pelanggan.
                </p>
              ) : null}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
