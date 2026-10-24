import { prisma, TxClient } from "@/lib/db/prisma"

/**
 * F-2026-10-22-072-S (inti F-2026-10-21-024) — registri part terpasang
 * per kendaraan (`InstalledPart`). Putusan BOT 1 §8A (PR #538):
 * Q-IP-1 MI proyek tanpa WO lahir bila Project.customerVehicleId terisi;
 * Q-IP-2 izin reuse keluarga garansi existing; Q-IP-4 tanpa backfill;
 * Q-IP-5 baris tidak dihapus, penanda batal dari status sumber.
 *
 * Lahir OTOMATIS — satu-satunya jalan masuk (BR-IP-01, tanpa form bebas):
 * - `createInstalledPartsForWorkOrder` di tx completeWorkOrder, untuk
 *   SEMUA baris MaterialIssue completed WO itu (bukan hanya bergaransi,
 *   BR-IP-02), satu transaksi dengan coverage garansi.
 * - `createInstalledPartsForMaterialIssue` di tx completeMaterialIssue
 *   untuk MI taut proyek tanpa WO (Q-IP-1). MI taut WO dilewati di sini —
 *   registri WO lahir saat WO selesai, bukan saat issue selesai.
 * Kendaraan tidak teratribusi = tidak lahir + terhitung `skipped`
 * (BR-IP-07); dokumen sumber tetap selesai.
 *
 * Q-IP-3 (fisik BOT 3): serial = 1 baris/unit qty=1 dari serialNumbers
 * ter-konsumsi; non-serial = 1 baris per baris issue. Idempoten lewat
 * cek-baca + jangkar DB @@unique(materialIssueItemId, serialKey),
 * serialKey = serialNumber ?? "" (pola WarrantyCoverage); P2002 ditelan
 * sebagai "sudah ada" (BR-IP-04).
 *
 * Catat lepas (`recordInstalledPartRemoval`) TIDAK membuat StockMove/
 * jurnal/retur (BR-IP-06). Status turunan dari qtyRemoved (BR-IP-05):
 * TERPASANG / SEBAGIAN_DILEPAS / DILEPAS — tidak disimpan, tidak bisa
 * diedit bebas; tidak ada jalur edit/hapus baris registri (AC-IP-8).
 */

export const INSTALLED_PART_STATUSES = ["TERPASANG", "SEBAGIAN_DILEPAS", "DILEPAS"] as const
export type InstalledPartStatus = (typeof INSTALLED_PART_STATUSES)[number]

const EPS = 0.0001

export function deriveInstalledPartStatus(qty: number, qtyRemoved: number): InstalledPartStatus {
  if (qtyRemoved <= EPS) return "TERPASANG"
  if (qtyRemoved >= qty - EPS) return "DILEPAS"
  return "SEBAGIAN_DILEPAS"
}

function parseSerialNumbers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => String(s).trim()).filter((s) => s.length > 0)
}

export interface InstalledPartBirthResult {
  created: number
  /** Baris issue yang tidak melahirkan registri (tanpa kendaraan). */
  skipped: number
}

interface BirthLine {
  materialIssueItemId: number
  itemId: number
  qty: number
  serialNumbers: unknown
}

/**
 * Inti lahir bersama. `coverageWorkOrderId` = WO sumber untuk menaut
 * coverage garansi baris yang sama (jalur WO; coverage lahir lebih dulu
 * di tx yang sama). Jalur proyek: null — tidak ada coverage dari jalur
 * itu, warrantyCoverageId tetap null.
 */
async function createInstalledPartRows(
  client: TxClient | typeof prisma,
  input: {
    customerVehicleId: number
    coverageWorkOrderId: number | null
    installedAt: Date
    lines: BirthLine[]
  },
): Promise<{ created: number }> {
  if (input.lines.length === 0) return { created: 0 }

  const coverages =
    input.coverageWorkOrderId != null
      ? await client.warrantyCoverage.findMany({
          where: { workOrderId: input.coverageWorkOrderId },
          select: { id: true, itemId: true, serialNumber: true },
        })
      : []
  const coverageByKey = new Map(
    coverages.map((c) => [`${c.itemId}::${c.serialNumber ?? ""}`, c.id]),
  )

  const existing = await client.installedPart.findMany({
    where: { materialIssueItemId: { in: input.lines.map((l) => l.materialIssueItemId) } },
    select: { materialIssueItemId: true, serialKey: true },
  })
  const existingKeys = new Set(existing.map((r) => `${r.materialIssueItemId}::${r.serialKey}`))

  let created = 0
  for (const line of input.lines) {
    const serials = parseSerialNumbers(line.serialNumbers)
    const units: { serialNumber: string | null; qty: number }[] =
      serials.length > 0
        ? serials.map((serialNumber) => ({ serialNumber, qty: 1 }))
        : [{ serialNumber: null, qty: line.qty }]
    for (const unit of units) {
      const serialKey = unit.serialNumber ?? ""
      const key = `${line.materialIssueItemId}::${serialKey}`
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      try {
        await client.installedPart.create({
          data: {
            customerVehicleId: input.customerVehicleId,
            itemId: line.itemId,
            materialIssueItemId: line.materialIssueItemId,
            serialNumber: unit.serialNumber,
            serialKey,
            qty: unit.qty,
            installedAt: input.installedAt,
            warrantyCoverageId: coverageByKey.get(`${line.itemId}::${serialKey}`) ?? null,
          },
        })
      } catch (e) {
        // Balapan dua transaksi: unique DB menolak salinan kedua — bukti
        // baris sudah ada, bukan error transaksi (pola warranty.service).
        if ((e as { code?: string })?.code === "P2002") continue
        throw e
      }
      created++
    }
  }
  return { created }
}

/**
 * Lahir dari penyelesaian WO. WO tanpa customerVehicleId: nol baris,
 * semua baris issue terhitung skipped (BR-IP-07) — bukan error.
 */
export async function createInstalledPartsForWorkOrder(
  workOrderId: number,
  installedAt: Date,
  client: TxClient | typeof prisma = prisma,
): Promise<InstalledPartBirthResult> {
  const wo = await client.workOrder.findUnique({
    where: { id: workOrderId },
    select: { customerVehicleId: true },
  })
  const issues = await client.materialIssue.findMany({
    where: { workOrderId, status: "completed" },
    select: {
      items: { select: { id: true, itemId: true, qty: true, serialNumbers: true } },
    },
  })
  const lines: BirthLine[] = issues.flatMap((mi) =>
    mi.items.map((row) => ({
      materialIssueItemId: row.id,
      itemId: row.itemId,
      qty: Number(row.qty),
      serialNumbers: row.serialNumbers,
    })),
  )
  if (!wo?.customerVehicleId) return { created: 0, skipped: lines.length }
  const { created } = await createInstalledPartRows(client, {
    customerVehicleId: wo.customerVehicleId,
    coverageWorkOrderId: workOrderId,
    installedAt,
    lines,
  })
  return { created, skipped: 0 }
}

/**
 * Lahir dari penyelesaian MI taut proyek tanpa WO (Q-IP-1). MI taut WO
 * atau bebas: tidak lahir di sini (WO lahir saat WO selesai; bebas tidak
 * ditebak kendaraannya). Proyek tanpa kendaraan: skipped (BR-IP-07).
 */
export async function createInstalledPartsForMaterialIssue(
  materialIssueId: number,
  client: TxClient | typeof prisma = prisma,
): Promise<InstalledPartBirthResult> {
  const issue = await client.materialIssue.findUnique({
    where: { id: materialIssueId },
    select: {
      workOrderId: true,
      projectId: true,
      date: true,
      items: { select: { id: true, itemId: true, qty: true, serialNumbers: true } },
    },
  })
  if (!issue || issue.workOrderId != null || issue.projectId == null) {
    return { created: 0, skipped: 0 }
  }
  const lines: BirthLine[] = issue.items.map((row) => ({
    materialIssueItemId: row.id,
    itemId: row.itemId,
    qty: Number(row.qty),
    serialNumbers: row.serialNumbers,
  }))
  const project = await client.project.findUnique({
    where: { id: issue.projectId },
    select: { customerVehicleId: true },
  })
  if (!project?.customerVehicleId) return { created: 0, skipped: lines.length }
  const { created } = await createInstalledPartRows(client, {
    customerVehicleId: project.customerVehicleId,
    coverageWorkOrderId: null,
    installedAt: issue.date,
    lines,
  })
  return { created, skipped: 0 }
}

/**
 * Catat lepas: qty dilepas kumulatif + alasan wajib + petugas dari sesi.
 * Serial: baris per-unit — qtyRemoved wajib tepat 1 (lepas penuh).
 * `replacedByInstalledPartId` (opsional) wajib baris registri kendaraan
 * yang sama dan belum DILEPAS. Tidak menyentuh stok/jurnal/retur.
 */
export async function recordInstalledPartRemoval(
  input: {
    installedPartId: number
    qtyRemoved: number
    removalReason: string
    removedById: number
    replacedByInstalledPartId?: number | null
    removedAt?: Date
  },
  client: TxClient | typeof prisma = prisma,
) {
  const reason = input.removalReason?.trim()
  if (!reason) throw new Error("Alasan pencatatan lepas part wajib diisi.")
  if (!Number.isFinite(input.qtyRemoved) || input.qtyRemoved <= 0) {
    throw new Error("Jumlah part dilepas wajib lebih dari nol.")
  }
  const part = await client.installedPart.findUnique({
    where: { id: input.installedPartId },
    select: { id: true, customerVehicleId: true, qty: true, qtyRemoved: true },
  })
  if (!part) throw new Error("Part terpasang tidak ditemukan.")
  const qty = Number(part.qty)
  const alreadyRemoved = Number(part.qtyRemoved)
  const remaining = qty - alreadyRemoved
  if (input.qtyRemoved > remaining + EPS) {
    throw new Error(
      `Jumlah dilepas (${input.qtyRemoved}) melebihi sisa terpasang (${remaining}).`,
    )
  }
  if (input.replacedByInstalledPartId != null) {
    if (input.replacedByInstalledPartId === part.id) {
      throw new Error("Part pengganti tidak boleh baris registri yang sama.")
    }
    const replacement = await client.installedPart.findUnique({
      where: { id: input.replacedByInstalledPartId },
      select: { id: true, customerVehicleId: true, qty: true, qtyRemoved: true },
    })
    if (!replacement || replacement.customerVehicleId !== part.customerVehicleId) {
      throw new Error("Part pengganti wajib baris terpasang kendaraan yang sama.")
    }
    if (
      deriveInstalledPartStatus(Number(replacement.qty), Number(replacement.qtyRemoved)) ===
      "DILEPAS"
    ) {
      throw new Error("Part pengganti sudah berstatus DILEPAS.")
    }
  }
  const newRemoved = alreadyRemoved + input.qtyRemoved
  const fullyRemoved = newRemoved >= qty - EPS
  return client.installedPart.update({
    where: { id: part.id },
    data: {
      qtyRemoved: newRemoved,
      removalReason: reason,
      removedById: input.removedById,
      removedAt: fullyRemoved ? (input.removedAt ?? new Date()) : null,
      ...(input.replacedByInstalledPartId != null
        ? { replacedByInstalledPartId: input.replacedByInstalledPartId }
        : {}),
    },
  })
}
