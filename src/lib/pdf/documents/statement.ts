/**
 * Menyusun `StatementDocument` (model lembar cetak) dari data laporan + identitas
 * perusahaan. Dipakai route `/api/pdf`, sehingga kop, periode, dan kaki cetak
 * hanya didefinisikan di satu tempat.
 */

import { companyAddressLines } from "@/lib/utils/company-address"
import { formatDate } from "@/lib/utils/format"
import { getSystemSettings } from "@/lib/utils/settings"
import { resolveDocumentLogo } from "@/lib/pdf/engine/logo"
import type { DocumentLetterhead, StatementDocument, TableDocument } from "@/lib/pdf/engine/types"
import { STATEMENT_SIGNATURES } from "@/lib/reports/report-export"
import type { StatementTable } from "@/lib/reports/statement-table"

/** Identitas perusahaan untuk kop, dari Pengaturan. */
export function companyLetterhead(
  settings: Awaited<ReturnType<typeof getSystemSettings>>,
  logo: DocumentLetterhead["logo"],
): DocumentLetterhead {
  return {
    companyName: settings.companyName || "Perusahaan",
    addressLines: companyAddressLines(settings),
    contactParts: [
      settings.companyPhone ? `Telp: ${settings.companyPhone}` : null,
      settings.companyEmail || null,
      settings.companyWebsite || null,
    ].filter((part): part is string => Boolean(part)),
    logo,
  }
}

/** Kaki halaman: waktu cetak + pengguna yang mencetak. */
export function printFooterText(printedBy?: string | null, now = new Date()): string {
  const stamped = formatDate(now, { format: "numeric", includeTime: true })
  return printedBy ? `Dicetak: ${stamped} oleh ${printedBy}` : `Dicetak: ${stamped}`
}

export interface StatementDocumentInput {
  title: string
  subtitle?: string
  periodCaption: string
  table: StatementTable
  printedBy?: string | null
  signatures?: string[]
  /** Origin permintaan, untuk menyelesaikan URL logo yang relatif. */
  origin?: string
}

export interface TableDocumentInput {
  title: string
  subtitle?: string
  periodCaption: string
  table: TableDocument["table"]
  printedBy?: string | null
  signatures?: string[]
  landscape?: boolean
  origin?: string
}

/** Kop + logo + kaki halaman yang sama untuk semua jenis lembar. */
async function buildDocumentParts(
  input: { printedBy?: string | null; origin?: string },
): Promise<{ letterhead: DocumentLetterhead; printFooter: string }> {
  const settings = await getSystemSettings()
  const logo = await resolveDocumentLogo(settings.companyLogo, input.origin)
  const letterhead = companyLetterhead(settings, logo)

  // Nama pencetak yang sama dengan nama perusahaan tidak perlu diulang di kaki
  // halaman — sama seperti perilaku lembar laporan di layar.
  const printedBy = input.printedBy === letterhead.companyName ? null : input.printedBy

  return { letterhead, printFooter: printFooterText(printedBy) }
}

export async function buildStatementDocument(
  input: StatementDocumentInput,
): Promise<StatementDocument> {
  const parts = await buildDocumentParts(input)

  return {
    ...parts,
    title: input.title,
    subtitle: input.subtitle,
    periodCaption: input.periodCaption,
    metaRight: "Mata Uang: Indonesian Rupiah",
    table: input.table,
    signatures: input.signatures ?? STATEMENT_SIGNATURES,
  }
}

/** Lembar laporan berbentuk daftar (mis. registry aset tetap). */
export async function buildTableDocument(input: TableDocumentInput): Promise<TableDocument> {
  const parts = await buildDocumentParts(input)

  return {
    ...parts,
    title: input.title,
    subtitle: input.subtitle,
    periodCaption: input.periodCaption,
    metaRight: "Mata Uang: Indonesian Rupiah",
    table: input.table,
    landscape: input.landscape,
    signatures: input.signatures ?? STATEMENT_SIGNATURES,
  }
}
