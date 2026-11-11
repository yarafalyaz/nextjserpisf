/**
 * Utility untuk mengekspor data tabel ke berkas CSV yang aman dibuka di Microsoft Excel
 * dan Google Spreadsheet, dengan perlindungan terhadap serangan CSV Formula Injection (CWE-1236).
 */

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = "";
  if (typeof value === "object") {
    if (value instanceof Date) {
      str = value.toISOString().split("T")[0];
    } else if (Array.isArray(value)) {
      str = value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join("; ");
    } else {
      str = JSON.stringify(value);
    }
  } else {
    str = String(value);
  }

  // Anti formula-injection spreadsheet (CWE-1236): netralkan awalan formula
  if (/^[=+\-@\t|%]/.test(str)) {
    str = `\t${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

export interface ExportColumn<T> {
  id: string;
  header: string;
  accessor?: (row: T) => unknown;
}

export function exportTableToCsv<T extends Record<string, any>>({
  filename,
  columns,
  data,
}: {
  filename: string;
  columns: ExportColumn<T>[];
  data: T[];
}): void {
  if (typeof window === "undefined" || !data || data.length === 0) {
    return;
  }

  const headerRow = columns.map((col) => escapeCsvCell(col.header)).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = col.accessor ? col.accessor(row) : row[col.id];
        return escapeCsvCell(val);
      })
      .join(",")
  );

  // UTF-8 BOM (\ufeff) agar Excel membaca karakter khusus / aksen dengan benar
  const csvContent = "\ufeff" + [headerRow, ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const cleanFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.setAttribute("href", url);
  link.setAttribute("download", cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
