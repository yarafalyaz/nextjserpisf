/**
 * Parser CSV rekening koran bank — murni, tanpa Prisma/DOM.
 *
 * Format diterima: baris pertama header, pemisah `;` atau `,` (dideteksi
 * dari header). Kolom dikenali dari sinonim Indonesia/Inggris:
 * tanggal (tanggal/date), keterangan (keterangan/deskripsi/description),
 * referensi (referensi/reference), lalu salah satu bentuk nominal:
 * kolom debit+kredit terpisah, ATAU satu kolom nominal bertanda
 * (nominal/amount/mutasi — positif = debit, negatif = kredit).
 *
 * Tanggal: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY` → dinormalkan ke
 * `YYYY-MM-DD` (hari kalender; konversi WIB dilakukan action).
 * Nominal lewat `parseMoneyAmount` (format id-ID didukung).
 *
 * Baris rusak TIDAK pernah dibuang senyap: setiap baris bermasalah
 * menghasilkan satu entri `errors` bernomor baris file (header = 1).
 * Baris yang benar-benar kosong dilewati (umum di akhir berkas).
 * Action pemanggil menolak seluruh import bila `errors` tak kosong.
 */

import { parseMoneyAmount } from "@/lib/utils/parse-money"

export interface BankStatementCsvLine {
  /** `YYYY-MM-DD` hari kalender. */
  date: string
  description: string | null
  /** Selalu positif; `type` yang menentukan arah. */
  amount: number
  type: "debit" | "credit"
  reference: string | null
}

export interface BankStatementCsvError {
  /** Nomor baris pada berkas, 1-based (header = baris 1). */
  row: number
  message: string
}

const HEADER_ALIASES: Record<string, readonly string[]> = {
  date: ["tanggal", "date", "tgl"],
  description: ["keterangan", "deskripsi", "description", "uraian"],
  reference: ["referensi", "reference", "ref"],
  debit: ["debit", "debet"],
  credit: ["kredit", "credit"],
  amount: ["nominal", "amount", "mutasi", "jumlah"],
}

/** Pisah satu baris CSV: quote ganda untuk sel berisi pemisah/kutip. */
function splitCsvRow(row: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i]
    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      cells.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map((cell) => cell.trim())
}

/** Normalkan tanggal ke `YYYY-MM-DD`; `null` bila tidak dikenal / tidak sah. */
function normalizeDate(raw: string): string | null {
  const text = raw.trim()
  let year: number
  let month: number
  let day: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else if (dmy) {
    day = Number(dmy[1])
    month = Number(dmy[2])
    year = Number(dmy[3])
  } else {
    return null
  }
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${year}-${pad(month)}-${pad(day)}`
}

function findColumn(headers: string[], key: string): number {
  const aliases = HEADER_ALIASES[key] ?? []
  return headers.findIndex((header) => aliases.includes(header))
}

export function parseBankStatementCsv(text: string): {
  lines: BankStatementCsvLine[]
  errors: BankStatementCsvError[]
} {
  const rows = text.replace(/^﻿/, "").split(/\r\n|\r|\n/)
  const headerIndex = rows.findIndex((row) => row.trim() !== "")
  if (headerIndex === -1) {
    return { lines: [], errors: [{ row: 1, message: "Berkas kosong — tidak ada header CSV." }] }
  }
  const headerRowNumber = headerIndex + 1
  const delimiter = rows[headerIndex].includes(";") ? ";" : ","
  const headers = splitCsvRow(rows[headerIndex], delimiter).map((h) => h.toLowerCase())

  const dateCol = findColumn(headers, "date")
  if (dateCol === -1) {
    return {
      lines: [],
      errors: [{ row: headerRowNumber, message: "Kolom tanggal tidak ditemukan (header: tanggal/date)." }],
    }
  }
  const descCol = findColumn(headers, "description")
  const refCol = findColumn(headers, "reference")
  const debitCol = findColumn(headers, "debit")
  const creditCol = findColumn(headers, "credit")
  const amountCol = findColumn(headers, "amount")
  const hasSplit = debitCol !== -1 || creditCol !== -1
  if (!hasSplit && amountCol === -1) {
    return {
      lines: [],
      errors: [
        {
          row: headerRowNumber,
          message: "Kolom nominal tidak ditemukan (perlu debit+kredit, atau satu kolom nominal/amount).",
        },
      ],
    }
  }

  const lines: BankStatementCsvLine[] = []
  const errors: BankStatementCsvError[] = []

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    if (rows[i].trim() === "") continue
    const rowNumber = i + 1
    const cells = splitCsvRow(rows[i], delimiter)
    const cell = (col: number): string => (col === -1 ? "" : (cells[col] ?? ""))

    const date = normalizeDate(cell(dateCol))
    if (date === null) {
      errors.push({ row: rowNumber, message: `Tanggal tidak valid: "${cell(dateCol)}" (format YYYY-MM-DD atau DD/MM/YYYY).` })
      continue
    }

    let amount: number
    let type: "debit" | "credit"
    if (hasSplit) {
      const debit = parseMoneyAmount(cell(debitCol)) ?? 0
      const credit = parseMoneyAmount(cell(creditCol)) ?? 0
      if (debit > 0 && credit > 0) {
        errors.push({ row: rowNumber, message: "Debit dan kredit terisi dua-duanya — isi salah satu arah saja." })
        continue
      }
      if (debit <= 0 && credit <= 0) {
        errors.push({ row: rowNumber, message: "Nominal harus lebih dari 0 (debit maupun kredit kosong/nol)." })
        continue
      }
      type = debit > 0 ? "debit" : "credit"
      amount = debit > 0 ? debit : credit
    } else {
      const signed = parseMoneyAmount(cell(amountCol))
      if (signed === null || signed === 0) {
        errors.push({ row: rowNumber, message: "Nominal harus lebih dari 0 dan berupa angka." })
        continue
      }
      type = signed > 0 ? "debit" : "credit"
      amount = Math.abs(signed)
    }

    lines.push({
      date,
      description: cell(descCol) || null,
      amount,
      type,
      reference: cell(refCol) || null,
    })
  }

  return { lines, errors }
}
