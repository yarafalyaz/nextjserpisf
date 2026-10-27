export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { CanCreate } from "@/components/auth/can-create";
import { formatDate } from "@/lib/utils/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteTicket } from "@/actions/crm.actions";
import { TicketCommentForm } from "./_components/ticket-comment-form";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pencil } from "lucide-react";

import type { Metadata } from "next";

import { TicketSlaChip } from "@/components/reports/ticket-sla-chip"
import { getCrmTicketSla } from "@/lib/reports/crm-ticket-sla-data"
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityHref, entityEditHref } from "@/lib/utils/entity-url";

export const metadata: Metadata = { title: "Tiket" };

export default async function CrmTicketDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_tickets");
  const { slug } = await params;

  const ticket = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.crmTicket.findFirst({
          where: { slug: s, ...where },
          include: { comments: { orderBy: { createdAt: "desc" } } },
        }),
      byId: (id, where) =>
        prisma.crmTicket.findUnique({
          where: { id, ...where },
          include: { comments: { orderBy: { createdAt: "desc" } } },
        }),
    },
  );

  if (!ticket) notFound();

  const [customer, assignee] = await Promise.all([
    ticket.customerId
      ? prisma.customer.findUnique({
          where: { id: ticket.customerId },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve(null),
    ticket.assignedTo
      ? prisma.user.findUnique({
          where: { id: ticket.assignedTo },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  // Keadaan SLA 001-U atas F-2026-10-24-135-S: baris server untuk tiket
  // ini dari loader read-only (tiket nonaktif tidak terdaftar = tanpa
  // lencana/tenggat). Tenggat dueAt server apa adanya; UI tidak
  // menghitung jam kerja. Kegagalan loader = tanpa seksi SLA.
  const slaRow = await getCrmTicketSla()
    .then((sla) => sla.rows.find((row) => row.ticketId === ticket.id) ?? null)
    .catch((error) => {
      console.error("[crm/tickets/detail] SLA tiket:", error)
      return null
    })

  // Resolve comment author names in one query
  const commentUserIds = Array.from(
    new Set(
      ticket.comments
        .map((c) => c.userId)
        .filter((v): v is number => v != null),
    ),
  );
  const commentUsers = commentUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: commentUserIds } },
        select: { id: true, name: true },
      })
    : [];
  const commentUserMap = new Map(commentUsers.map((u) => [u.id, u.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Tiket: ${ticket.subject}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "CRM", href: "/crm" },
          { label: "Tiket", href: "/crm/tickets" },
          { label: ticket.subject },
        ]}
        badge={
          <>
            <StatusChip status={ticket.status} />
            <StatusChip status={ticket.priority} />
            {slaRow ? <TicketSlaChip primaryState={slaRow.primaryState} /> : null}
          </>
        }
        actions={
          <>
            <CanCreate permission="edit_tickets">
              <Button href={entityEditHref("/crm/tickets", ticket)} variant="primary">
                <Pencil size={14} /> Ubah
              </Button>
            </CanCreate>
            <CanCreate permission="delete_tickets">
              <DeleteButton id={ticket.id} action={deleteTicket} />
            </CanCreate>
            <BackButton href="/crm/tickets" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Subjek" value={ticket.subject} />
        <DetailField
          label="Prioritas"
          value={<StatusChip status={ticket.priority} />}
        />
        <DetailField
          label="Status"
          value={<StatusChip status={ticket.status} />}
        />
        {ticket.customerId && (
          <DetailField
            label="Pelanggan"
            value={
              customer ? (
                <Link
                  href={entityHref("/master/pelanggan", customer)}
                  className="text-primary hover:underline"
                >
                  {customer.name}
                </Link>
              ) : (
                `#${ticket.customerId}`
              )
            }
          />
        )}
        {ticket.assignedTo && (
          <DetailField
            label="Ditugaskan ke"
            value={assignee?.name ?? `Pengguna #${ticket.assignedTo}`}
          />
        )}
        <DetailField label="Dibuat" value={formatDate(ticket.createdAt)} />
        {slaRow ? (
          <DetailField label="SLA" value={<TicketSlaChip primaryState={slaRow.primaryState} />} />
        ) : null}
        {slaRow?.response.dueAt ? (
          <DetailField
            label="Tenggat Respons"
            value={formatDate(slaRow.response.dueAt, { includeTime: true })}
          />
        ) : null}
        {slaRow?.resolution.dueAt ? (
          <DetailField
            label="Tenggat Resolusi"
            value={formatDate(slaRow.resolution.dueAt, { includeTime: true })}
          />
        ) : null}
        {slaRow?.isUnknownPriority ? (
          <DetailField label="Penanda Prioritas" value="Prioritas tak dikenal" />
        ) : null}
        {ticket.description && (
          <DetailField
            label="Deskripsi"
            value={ticket.description}
            colSpan="full"
          />
        )}
      </DetailCard>

      {/* Comments */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Komentar
          </h2>
        </div>
        <TicketCommentForm ticketId={ticket.id} />
        <div className="p-4 px-5">
          {ticket.comments.length === 0 ? (
            <EmptyState title="Belum ada komentar" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Pengguna</DetailTableTh>
                <DetailTableTh>Komentar</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {ticket.comments.map((comment) => (
                  <DetailTableRow key={comment.id}>
                    <DetailTableTd>
                      {comment.userId
                        ? (commentUserMap.get(comment.userId) ??
                          `Pengguna #${comment.userId}`)
                        : "-"}
                    </DetailTableTd>
                    <DetailTableTd>
                      {/* Tanda catatan internal: kolom `isInternal` kini benar-benar
                          dipakai, bukan hanya tersimpan tanpa terlihat. */}
                      {comment.isInternal && (
                        <span className="mr-2 inline-block align-middle text-[0.6875rem] font-medium px-2 py-0.5 rounded-full border border-default text-muted-foreground">
                          Internal
                        </span>
                      )}
                      {comment.body}
                    </DetailTableTd>
                    <DetailTableTd>
                      {formatDate(comment.createdAt)}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  );
}
