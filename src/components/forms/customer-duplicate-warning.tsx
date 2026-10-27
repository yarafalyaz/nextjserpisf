"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"
import { Button } from "@/components/ui/button"
import { entityHref } from "@/lib/utils/entity-url"

// Tipe respons createCustomer/updateCustomer (kontrak Backend PR #791,
// customer-duplicate.service.ts) — didefinisikan lokal: modul service
// menarik Prisma ke bundle klien dan mematahkan build. Semua teks
// (title/body/matchLabel) dirender verbatim dari server; komponen ini
// tidak menghitung kemiripan apa pun (AC-CD-F1).
export interface CustomerDuplicateCandidateView {
  id: number
  slug: string | null
  name: string
  code: string | null
  phone: string | null
  email: string | null
  taxId: string | null
  matchKind: "npwp" | "phone" | "name_secondary"
  matchLabel: string
}

export interface CustomerDuplicateWarningView {
  title: string
  body: string
  candidates: CustomerDuplicateCandidateView[]
}

export function CustomerDuplicateCandidateRow({
  candidate,
}: {
  candidate: CustomerDuplicateCandidateView
}) {
  return (
    <li className="rounded-lg border border-default bg-surface px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">
          {candidate.name}
          {candidate.code ? ` (${candidate.code})` : ""}
        </span>
        <Link
          href={entityHref("/master/pelanggan", candidate)}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Buka pelanggan existing
        </Link>
      </div>
      <p className="mt-1 text-muted-foreground">{candidate.matchLabel}</p>
      {(candidate.phone || candidate.email || candidate.taxId) && (
        <p className="mt-0.5 text-muted-foreground">
          {[
            candidate.phone ? `Telepon: ${candidate.phone}` : null,
            candidate.email ? `Email: ${candidate.email}` : null,
            candidate.taxId ? `NPWP: ${candidate.taxId}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </li>
  )
}

export interface CustomerNpwpConflictView {
  id: number
  slug: string | null
  name: string
  code: string | null
  title: string
}

// Q-CD-1 (PR Backend #1017): simpan DITOLAK karena NPWP persis sudah
// dipegang pelanggan lain. Judul + pesan + identitas pemegang verbatim
// dari server; komponen hanya menambah tautan master pemegang.
export function CustomerNpwpBlockedPanel({
  conflict,
  message,
}: {
  conflict: CustomerNpwpConflictView
  message: string
}) {
  return (
    <Alert variant="destructive" aria-label="NPWP sudah dipakai pelanggan lain">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{conflict.title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <p className="mt-3">
          <Link
            href={entityHref("/master/pelanggan", conflict)}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Buka pelanggan existing
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  )
}

export function CustomerDuplicateWarningPanel({
  warning,
  onContinue,
}: {
  warning: CustomerDuplicateWarningView
  onContinue: () => void
}) {
  return (
    <Alert variant="warning" aria-label="Peringatan duplikat pelanggan">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{warning.title}</AlertTitle>
      <AlertDescription>
        <p>{warning.body}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {warning.candidates.map((candidate) => (
            <CustomerDuplicateCandidateRow key={candidate.id} candidate={candidate} />
          ))}
        </ul>
        <div className="mt-3">
          <Button type="button" variant="primary" onPress={onContinue}>
            Lanjut ke Daftar Pelanggan
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
