export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/button"
import { CanCreate } from "@/components/auth/can-create"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { ApplicantForm } from "../_components/applicant-form"
import {
  ApplicantStageSelect,
  HireButton,
  VacancyStatusButton,
} from "../_components/applicant-actions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Lowongan" }

const STATUS_LABELS: Record<string, string> = {
  draft: "Konsep",
  open: "Terbuka",
  closed: "Ditutup",
}

const STAGE_LABELS: Record<string, string> = {
  applied: "Melamar",
  screening: "Seleksi Berkas",
  interview: "Wawancara",
  offering: "Penawaran",
  hired: "Diterima",
  rejected: "Ditolak",
}

export default async function VacancyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_recruitments")
  const { slug } = await params

  const vacancy = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.jobVacancy.findFirst({
          where: { slug: s, deletedAt: null },
          include: {
            department: { select: { name: true } },
            position: { select: { name: true } },
            applicants: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              include: {
                hiredEmployee: { select: { employeeNo: true, slug: true } },
              },
            },
          },
        }),
      byId: (id) =>
        prisma.jobVacancy.findFirst({
          where: { id, deletedAt: null },
          include: {
            department: { select: { name: true } },
            position: { select: { name: true } },
            applicants: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              include: {
                hiredEmployee: { select: { employeeNo: true, slug: true } },
              },
            },
          },
        }),
    },
  )

  if (!vacancy) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Rekrutmen", href: "/sdm/rekrutmen" },
        { label: vacancy.title },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{vacancy.title}</h1>
          <p className="text-sm text-muted-foreground">
            {vacancy.code} · {vacancy.department?.name ?? "-"} · {vacancy.position?.name ?? "-"} · Status: {STATUS_LABELS[vacancy.status] ?? vacancy.status}
          </p>
        </div>
        <div className="flex gap-2">
          <VacancyStatusButton vacancyId={vacancy.id} status={vacancy.status} />
          <CanCreate permission="edit_recruitments">
            <Button href={`/sdm/rekrutmen/${vacancy.slug ?? vacancy.id}/ubah`} variant="secondary">Ubah</Button>
          </CanCreate>
        </div>
      </div>

      {(vacancy.description || vacancy.requirements) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {vacancy.description && (
            <section className="rounded-lg border border-default p-4">
              <h2 className="font-semibold mb-2">Deskripsi</h2>
              <p className="text-sm whitespace-pre-wrap">{vacancy.description}</p>
            </section>
          )}
          {vacancy.requirements && (
            <section className="rounded-lg border border-default p-4">
              <h2 className="font-semibold mb-2">Persyaratan</h2>
              <p className="text-sm whitespace-pre-wrap">{vacancy.requirements}</p>
            </section>
          )}
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Pelamar ({vacancy.applicants.length})</h2>

        {vacancy.status === "open" && (
          <CanCreate permission="create_recruitments">
            <ApplicantForm vacancyId={vacancy.id} />
          </CanCreate>
        )}

        <div className="overflow-x-auto rounded-lg border border-default">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default bg-surface-secondary text-left">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Kontak</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
                <th className="px-4 py-3 font-medium">Tahapan</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {vacancy.applicants.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Belum ada pelamar.
                  </td>
                </tr>
              )}
              {vacancy.applicants.map((a) => {
                const terminal = a.stage === "hired" || a.stage === "rejected"
                return (
                  <tr key={a.id} className="border-b border-default last:border-0">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3">{[a.email, a.phone].filter(Boolean).join(" · ") || "-"}</td>
                    <td className="px-4 py-3">{a.source ?? "-"}</td>
                    <td className="px-4 py-3">
                      {terminal ? (
                        STAGE_LABELS[a.stage]
                      ) : (
                        <ApplicantStageSelect applicantId={a.id} stage={a.stage} disabled={false} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.stage === "hired" && a.hiredEmployee ? (
                        <Link href={`/master/karyawan/${a.hiredEmployee.slug ?? ""}`} className="hover:underline font-mono text-xs">
                          {a.hiredEmployee.employeeNo}
                        </Link>
                      ) : a.stage === "offering" || a.stage === "interview" || a.stage === "screening" || a.stage === "applied" ? (
                        <HireButton applicantId={a.id} disabled={false} />
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
