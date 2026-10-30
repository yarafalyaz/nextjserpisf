import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { apiError } from "@/lib/api-response"

const DATA_DIR = join(process.cwd(), "src/data/address")

// Fix #49: Cache parsed CSV data in memory to avoid repeated file reads
const cache = new Map<string, string[][]>()

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function parseCSV(content: string): string[][] {
  return content.trim().split("\n").map(line => line.replace("\r", "").split(","))
}

async function loadCSV(filePath: string): Promise<string[][]> {
  if (cache.has(filePath)) return cache.get(filePath)!
  const content = await readFile(filePath, "utf-8")
  const rows = parseCSV(content)
  cache.set(filePath, rows)
  return rows
}

const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" }

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("tipe")
  const parentCode = searchParams.get("kodeInduk")

  // Region codes are always numeric (BPS codes). Reject anything else so a
  // user-supplied kodeInduk can never influence the CSV file path (the village
  // lookup derives a filename from it). Defense-in-depth against path traversal.
  if (parentCode !== null && !/^\d+$/.test(parentCode)) {
    return apiError("BAD_REQUEST", "Kode induk tidak valid")
  }

  try {
    if (type === "provinces") {
      const rows = await loadCSV(join(DATA_DIR, "provinces.csv"))
      const data = rows.map(r => ({ code: r[0], name: toTitleCase(r[1]) }))
      return NextResponse.json(data, { headers: CACHE_HEADERS })
    }

    if (type === "regencies" && parentCode) {
      const rows = await loadCSV(join(DATA_DIR, "cities.csv"))
      const filtered = rows.filter(r => r[1] === parentCode)
      const data = filtered.map(r => ({ code: r[0], name: toTitleCase(r[2]) }))
      return NextResponse.json(data, { headers: CACHE_HEADERS })
    }

    if (type === "districts" && parentCode) {
      const rows = await loadCSV(join(DATA_DIR, "districts.csv"))
      const filtered = rows.filter(r => r[1] === parentCode)
      const data = filtered.map(r => ({ code: r[0], name: toTitleCase(r[2]) }))
      return NextResponse.json(data, { headers: CACHE_HEADERS })
    }

    if (type === "villages" && parentCode) {
      const provinceCode = parentCode.substring(0, 2)
      const filePath = join(DATA_DIR, "villages", `${provinceCode}.csv`)
      // R7API-05: kode provinsi tak dikenal (mis. 99) dulu jatuh ke ENOENT ->
      // 500 lewat catch umum. Berkas desa tak ada = kode tak ditemukan (404).
      let rows: string[][]
      try {
        rows = await loadCSV(filePath)
      } catch (err) {
        if ((err as { code?: string })?.code === "ENOENT") {
          return apiError("NOT_FOUND", "Kode provinsi tidak ditemukan")
        }
        throw err
      }
      const filtered = rows.filter(r => r[1] === parentCode)
      const data = filtered.map(r => ({ code: r[0], name: toTitleCase(r[2]), postalCode: r[5] || "" }))
      return NextResponse.json(data, { headers: CACHE_HEADERS })
    }

    return apiError("BAD_REQUEST", "Tipe data alamat tidak dikenal")
  } catch {
    return apiError("INTERNAL_ERROR", "Gagal memuat data alamat")
  }
}
