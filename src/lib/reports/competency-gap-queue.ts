/**
 * Builder murni daftar kesenjangan kompetensi lintas karyawan
 * (F-2026-10-27-078-S, PUTUSAN LEAD Q-CGQ-1..8 di backlog §8, 27 Okt 2026).
 *
 * Fakta saat-baca, tanpa snapshot: syarat = `PositionCompetency` jabatan
 * karyawan saat ini, aktual = `EmployeeCompetency` terakhir (BR-CGQ-03).
 * Populasi: karyawan `deletedAt: null` + `isActive: true` +
 * `employmentEndedAt: null` (Q-CGQ-7) × syarat atas kompetensi
 * `deletedAt: null` (BR-CGQ-07). Tanpa syarat → terhitung `tanpa-syarat`
 * di rekap populasi, bukan baris gap (BR-CGQ-02). Belum dinilai →
 * `currentLevel: null`, BUKAN 0 (BR-CGQ-01). Memenuhi → rekap saja
 * (Q-CGQ-8). Penanda kritis hanya baris di-bawah-syarat dengan
 * gap >= COMPETENCY_GAP_CRITICAL_MIN (Q-CGQ-2); belum-dinilai bukan gap.
 *
 * Urutan Q-CGQ-3: ember belum-dinilai → di-bawah-syarat; dalam ember nama
 * kompetensi naik → nama karyawan naik; seri id karyawan naik → id
 * kompetensi naik. TANPA urutan gap/level, TANPA ranking/rata-rata/persen
 * (BR-CGQ-05/08, Q-CGQ-8). Payload tanpa `assessedBy`/`notes`, tanpa gaji
 * (BR-CGQ-09/10). Baca-saja: loader massal anti-N+1 di
 * loader pasangannya (`view_competencies` + `view_employees`
 * + `getHrScope` fail-closed sebelum query, Q-CGQ-6).
 */

export const COMPETENCY_GAP_TITLE = "Daftar Kesenjangan Kompetensi"

export const COMPETENCY_GAP_COLUMN_LABELS = {
  karyawan: "Karyawan",
  jabatan: "Jabatan",
  kompetensi: "Kompetensi",
  syarat: "Syarat",
  aktual: "Aktual",
  kesenjangan: "Kesenjangan",
  dinilai: "Dinilai",
} as const

export const COMPETENCY_GAP_BUCKETS = [
  "belum-dinilai",
  "di-bawah-syarat",
  "memenuhi",
] as const

export type CompetencyGapBucket = (typeof COMPETENCY_GAP_BUCKETS)[number]

/** Label ember verbatim §1 (Q-CGQ-3) — UI menempel apa adanya. */
export const COMPETENCY_GAP_BUCKET_LABELS: Record<
  CompetencyGapBucket,
  string
> = {
  "belum-dinilai": "Belum Dinilai",
  "di-bawah-syarat": "Di Bawah Syarat",
  memenuhi: "Memenuhi Syarat",
}

/** Label penanda kritis verbatim (Q-CGQ-3). */
export const COMPETENCY_GAP_CRITICAL_LABEL = "Kritis"

/** Notice verbatim §1 (Q-CGQ-3) — UI menempel apa adanya. */
export const COMPETENCY_GAP_NOTICE_TEXT =
  "Daftar ini membandingkan level kompetensi aktual dengan syarat jabatan saat ini. Belum dinilai berbeda dari level rendah; daftar ini tidak memberi peringkat antar karyawan."

export const COMPETENCY_GAP_EMPTY_TEXT =
  "Tidak ada kesenjangan kompetensi."

/** Tanda tanggal belum dinilai di kolom Dinilai (spec §1). */
export const COMPETENCY_GAP_NO_DATE_LABEL = "—"

/**
 * Ambang kritis Q-CGQ-2: satu-satunya tempat angka 2 hidup.
 * Hanya baris di-bawah-syarat; belum-dinilai tidak berpenanda.
 */
export const COMPETENCY_GAP_CRITICAL_MIN = 2

export interface CompetencyGapEmployeeInput {
  employeeId: number
  employeeName: string
  employeeDeletedAt: Date | null
  employeeIsActive: boolean
  employeeEmploymentEndedAt: Date | null
  positionId: number | null
  positionName: string | null
}

export interface CompetencyGapRequirementInput {
  positionId: number
  competencyId: number
  competencyName: string
  competencyDeletedAt: Date | null
  requiredLevel: number
}

export interface CompetencyGapActualInput {
  employeeId: number
  competencyId: number
  level: number
  assessedAt: Date
}

export interface CompetencyGapInput {
  employees: readonly CompetencyGapEmployeeInput[]
  requirements: readonly CompetencyGapRequirementInput[]
  actuals: readonly CompetencyGapActualInput[]
}

export interface CompetencyGapRow {
  employeeId: number
  employeeName: string
  positionId: number
  positionName: string | null
  competencyId: number
  competencyName: string
  requiredLevel: number
  /** null = belum dinilai (BR-CGQ-01); bukan 0. */
  currentLevel: number | null
  /** gap server = requiredLevel - level; null untuk belum-dinilai. */
  gap: number | null
  bucket: Exclude<CompetencyGapBucket, "memenuhi">
  bucketLabel: string
  /** Hanya di-bawah-syarat dengan gap >= ambang (Q-CGQ-2). */
  isCritical: boolean
  criticalLabel: string | null
  assessedAt: Date | null
}

export interface CompetencyGapGroupSummary {
  id: number
  name: string
  belumDinilai: number
  diBawahSyarat: number
  memenuhi: number
  /** Karyawan-distinct dalam grup ini (pasangan tidak dihitung ganda). */
  karyawanDistinct: number
  totalPasangan: number
}

export interface CompetencyGapQueue {
  rows: CompetencyGapRow[]
  /** Rekap per ember (memenuhi rekap-saja, Q-CGQ-8). */
  perBucket: Record<
    CompetencyGapBucket,
    { pasangan: number; karyawanDistinct: number }
  >
  perCompetency: CompetencyGapGroupSummary[]
  perPosition: CompetencyGapGroupSummary[]
  summary: {
    totalPasangan: number
    totalKaryawan: number
    belumDinilai: number
    diBawahSyarat: number
    memenuhi: number
    kritis: number
    /** Karyawan populasi tanpa satu pun syarat hidup (BR-CGQ-02). */
    tanpaSyarat: number
    totalKaryawanPopulasi: number
  }
  criticalMin: number
}

const BUCKET_ORDER: Record<CompetencyGapRow["bucket"], number> = {
  "belum-dinilai": 0,
  "di-bawah-syarat": 1,
}

function pairKey(employeeId: number, competencyId: number): string {
  return `${employeeId}:${competencyId}`
}

interface GroupAcc {
  id: number
  name: string
  belumDinilai: number
  diBawahSyarat: number
  memenuhi: number
  employees: Set<number>
  totalPasangan: number
}

function newGroup(id: number, name: string): GroupAcc {
  return {
    id,
    name,
    belumDinilai: 0,
    diBawahSyarat: 0,
    memenuhi: 0,
    employees: new Set(),
    totalPasangan: 0,
  }
}

function finishGroup(acc: GroupAcc): CompetencyGapGroupSummary {
  return {
    id: acc.id,
    name: acc.name,
    belumDinilai: acc.belumDinilai,
    diBawahSyarat: acc.diBawahSyarat,
    memenuhi: acc.memenuhi,
    karyawanDistinct: acc.employees.size,
    totalPasangan: acc.totalPasangan,
  }
}

export function buildCompetencyGapQueue(
  input: CompetencyGapInput,
): CompetencyGapQueue {
  const actualByPair = new Map<string, CompetencyGapActualInput>()
  for (const actual of input.actuals) {
    actualByPair.set(pairKey(actual.employeeId, actual.competencyId), actual)
  }

  // Syarat hidup saja, dikelompokkan per jabatan (BR-CGQ-07).
  const reqByPosition = new Map<number, CompetencyGapRequirementInput[]>()
  for (const req of input.requirements) {
    if (req.competencyDeletedAt != null) continue
    const list = reqByPosition.get(req.positionId) ?? []
    list.push(req)
    reqByPosition.set(req.positionId, list)
  }

  const rows: CompetencyGapRow[] = []
  const perCompetency = new Map<number, GroupAcc>()
  const perPosition = new Map<number, GroupAcc>()
  const bucketPairs: Record<CompetencyGapBucket, number> = {
    "belum-dinilai": 0,
    "di-bawah-syarat": 0,
    memenuhi: 0,
  }
  const bucketEmployees: Record<CompetencyGapBucket, Set<number>> = {
    "belum-dinilai": new Set(),
    "di-bawah-syarat": new Set(),
    memenuhi: new Set(),
  }
  const allEmployees = new Set<number>()
  let tanpaSyarat = 0
  let totalKaryawanPopulasi = 0
  let kritis = 0

  for (const employee of input.employees) {
    // Populasi Q-CGQ-7: aktif, tidak terhapus, belum berhenti.
    if (
      employee.employeeDeletedAt != null ||
      !employee.employeeIsActive ||
      employee.employeeEmploymentEndedAt != null
    ) {
      continue
    }
    totalKaryawanPopulasi += 1
    allEmployees.add(employee.employeeId)

    const reqs =
      employee.positionId == null
        ? []
        : (reqByPosition.get(employee.positionId) ?? [])
    if (reqs.length === 0) {
      // BR-CGQ-02: terhitung tanpa-syarat, bukan baris gap.
      tanpaSyarat += 1
      continue
    }

    for (const req of reqs) {
      const actual =
        actualByPair.get(pairKey(employee.employeeId, req.competencyId)) ??
        null
      const bucket: CompetencyGapBucket =
        actual == null
          ? "belum-dinilai"
          : actual.level < req.requiredLevel
            ? "di-bawah-syarat"
            : "memenuhi"

      bucketPairs[bucket] += 1
      bucketEmployees[bucket].add(employee.employeeId)

      const compAcc =
        perCompetency.get(req.competencyId) ??
        newGroup(req.competencyId, req.competencyName)
      perCompetency.set(req.competencyId, compAcc)
      const posAcc =
        perPosition.get(employee.positionId as number) ??
        newGroup(
          employee.positionId as number,
          employee.positionName ?? "",
        )
      perPosition.set(employee.positionId as number, posAcc)
      for (const acc of [compAcc, posAcc]) {
        acc.totalPasangan += 1
        acc.employees.add(employee.employeeId)
        if (bucket === "belum-dinilai") acc.belumDinilai += 1
        else if (bucket === "di-bawah-syarat") acc.diBawahSyarat += 1
        else acc.memenuhi += 1
      }

      if (bucket === "memenuhi") continue // Q-CGQ-8: rekap saja.

      const gap = actual == null ? null : req.requiredLevel - actual.level
      const isCritical =
        bucket === "di-bawah-syarat" &&
        gap != null &&
        gap >= COMPETENCY_GAP_CRITICAL_MIN
      if (isCritical) kritis += 1

      rows.push({
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        positionId: employee.positionId as number,
        positionName: employee.positionName,
        competencyId: req.competencyId,
        competencyName: req.competencyName,
        requiredLevel: req.requiredLevel,
        currentLevel: actual?.level ?? null,
        gap,
        bucket,
        bucketLabel: COMPETENCY_GAP_BUCKET_LABELS[bucket],
        isCritical,
        criticalLabel: isCritical ? COMPETENCY_GAP_CRITICAL_LABEL : null,
        assessedAt: actual?.assessedAt ?? null,
      })
    }
  }

  // Q-CGQ-3: ember → nama kompetensi ↑ → nama karyawan ↑ → id karyawan
  // ↑ → id kompetensi ↑. Tanpa urutan gap/level.
  rows.sort((a, b) => {
    if (a.bucket !== b.bucket) {
      return BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]
    }
    const byComp = a.competencyName.localeCompare(b.competencyName, "id")
    if (byComp !== 0) return byComp
    const byEmp = a.employeeName.localeCompare(b.employeeName, "id")
    if (byEmp !== 0) return byEmp
    if (a.employeeId !== b.employeeId) return a.employeeId - b.employeeId
    return a.competencyId - b.competencyId
  })

  const byNameId = (a: CompetencyGapGroupSummary, b: CompetencyGapGroupSummary) =>
    a.name.localeCompare(b.name, "id") || a.id - b.id

  return {
    rows,
    perBucket: {
      "belum-dinilai": {
        pasangan: bucketPairs["belum-dinilai"],
        karyawanDistinct: bucketEmployees["belum-dinilai"].size,
      },
      "di-bawah-syarat": {
        pasangan: bucketPairs["di-bawah-syarat"],
        karyawanDistinct: bucketEmployees["di-bawah-syarat"].size,
      },
      memenuhi: {
        pasangan: bucketPairs.memenuhi,
        karyawanDistinct: bucketEmployees.memenuhi.size,
      },
    },
    perCompetency: [...perCompetency.values()]
      .map(finishGroup)
      .sort(byNameId),
    perPosition: [...perPosition.values()].map(finishGroup).sort(byNameId),
    summary: {
      totalPasangan:
        bucketPairs["belum-dinilai"] +
        bucketPairs["di-bawah-syarat"] +
        bucketPairs.memenuhi,
      totalKaryawan: allEmployees.size,
      belumDinilai: bucketPairs["belum-dinilai"],
      diBawahSyarat: bucketPairs["di-bawah-syarat"],
      memenuhi: bucketPairs.memenuhi,
      kritis,
      tanpaSyarat,
      totalKaryawanPopulasi,
    },
    criticalMin: COMPETENCY_GAP_CRITICAL_MIN,
  }
}
