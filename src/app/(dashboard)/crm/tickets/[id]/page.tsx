export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/utils/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteTicket } from "@/actions/crm.actions";
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
import { Pencil } from "lucide-react";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tickets" };

export default async function CrmTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("view_tickets");
  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const ticket = await prisma.crmTicket.findUnique({
    where: { id: numId },
    include: {
      comments: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!ticket) notFound();

  const [customer, assignee] = await Promise.all([
    ticket.customerId
      ? prisma.customer.findUnique({
          where: { id: ticket.customerId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    ticket.assignedTo
      ? prisma.user.findUnique({
          where: { id: ticket.assignedTo },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

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
          </>
        }
        actions={
          <>
            <Button href={`/crm/tickets/${ticket.id}/ubah`} variant="primary">
              <Pencil size={14} /> Ubah
            </Button>
            <DeleteButton id={ticket.id} action={deleteTicket} />
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
                  href={`/master/pelanggan/${customer.id}`}
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
            value={assignee?.name ?? `User #${ticket.assignedTo}`}
          />
        )}
        <DetailField label="Dibuat" value={formatDate(ticket.createdAt)} />
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
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Komentar
          </h2>
        </div>
        <div className="p-4 px-5">
          {ticket.comments.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              Belum ada komentar
            </p>
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
                          `User #${comment.userId}`)
                        : "-"}
                    </DetailTableTd>
                    <DetailTableTd>{comment.body}</DetailTableTd>
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
