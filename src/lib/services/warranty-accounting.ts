/**
 * F-49 — Vonis akuntansi garansi pasca-serah-terima (Salsa, otoritas uang).
 *
 * Modul ini BUKAN fitur garansi. Ini mesin keputusan murni (pure, tanpa Prisma)
 * yang membakukan putusan akuntansi supaya inti F-49 (model `WarrantyRecord` +
 * WO klaim) — bila Nara buka — tidak mengarang perlakuan jurnal di tempat.
 * Tidak ada model/migrasi/jurnal baru yang dibuat dari modul ini; default aman
 * (perilaku berjalan: tanpa garansi tercatat) tetap aktif.
 *
 * ── Dasar aturan ────────────────────────────────────────────────────────────
 * 1. PSAK 72 (Pendapatan dari Kontrak dengan Pelanggan) PP28–PP33 — garansi:
 *    - `assurance` (keyakinan produk sesuai spesifikasi yang disepakati):
 *      BUKAN kewajiban pelaksanaan terpisah → tidak ada alokasi harga transaksi,
 *      tidak ada pendapatan ditangguhkan. Dicatat sebagai provisi (PSAK 57).
 *    - `service` (jasa tambahan di luar keyakinan, mis. perpanjangan berbayar):
 *      kewajiban pelaksanaan terpisah → sebagian harga transaksi dialokasikan
 *      dan diakui sebagai pendapatan sepanjang masa jasa. Bila keduanya tak
 *      dapat dicatat terpisah secara wajar → satu kewajiban pelaksanaan.
 * 2. PSAK 57 (Provisi, Liabilitas Kontinjensi, Aset Kontinjensi) par 14, 24, 36:
 *    provisi garansi diakui pada saat penjualan/serah-terima bila (a) ada
 *    kewajiban kini akibat peristiwa masa lalu, (b) kemungkinan besar arus
 *    keluar sumber daya, (c) estimasi andal dapat dibuat. Jumlah = estimasi
 *    terbaik. Provisi ditelaah tiap akhir periode; bila arus keluar tidak lagi
 *    kemungkinan besar → dibatalkan (reversal ke beban, bukan pendapatan).
 *    Penggantian dari pihak ketiga (klaim supplier) diakui sebagai ASET
 *    TERPISAH hanya bila sudah hampir pasti (virtually certain) diterima,
 *    tidak boleh di-net-off terhadap provisi di neraca.
 * 3. Biaya rework aktual saat klaim terjadi = realisasi provisi, bukan beban
 *    baru: Dr Provisi Garansi / Cr Persediaan·WIP·Kas·Utang. Bila provisi tidak
 *    pernah dibentuk (estimasi tidak andal / garansi tidak tercatat), biaya
 *    dibebankan saat terjadi: Dr Beban Garansi / Cr … (pengungkapan, bukan
 *    penyesuaian diam-diam ke invoice lama — WAR-01).
 * 4. Rework yang DAPAT DITAGIH ke pelanggan (di luar cakupan / masa lewat /
 *    klaim ditolak) BUKAN biaya garansi: ia pekerjaan baru → WO + invoice baru
 *    normal (Dr Piutang / Cr Pendapatan + PPN keluaran bila PKP, Dr HPP /
 *    Cr Persediaan). Rework dalam cakupan TIDAK BOLEH terbit invoice
 *    (risiko tertagih dobel — temuan inti F-49).
 * 5. Part pengganti dari stok: keluar pada HPP/FIFO berjalan (InventoryLayer),
 *    sama seperti material issue biasa — nilai lapisan, bukan harga jual.
 *    Recovery supplier atas part: bila hampir pasti → Dr Piutang Klaim Supplier
 *    / Cr Beban Garansi (pemulihan biaya periode berjalan) — tidak menyentuh
 *    pendapatan; bila belum hampir pasti → cukup diungkapkan (aset kontinjensi,
 *    PSAK 57 par 31–35), tanpa jurnal.
 *
 * ── Pemetaan akun ke CoA Silengkap (src/lib/setup/base-data.ts) ─────────────
 * Beban/provisi memakai kelompok COGS 5101 (induk HPP) agar margin job asal
 * terlihat (PRD REP-12 lifetime warranty cost), BUKAN 6000 Beban Operasional:
 * garansi adalah biaya memenuhi penjualan asal, bukan overhead periode.
 * Kode di bawah adalah REKOMENDASI anak baru di bawah 5101 — belum ada di CoA
 * berjalan dan TIDAK dibuat oleh modul ini (menunggu inti dibuka Nara):
 *   510103 Beban Garansi (akrual & realisasi tanpa provisi)  [COGS]
 *   2105xx Provisi Garansi (liabilitas)                      [OCLY/LTLY]
 *   1108xx Piutang Klaim Supplier — Garansi (aset lain)      [OCAS]
 * Fail-closed berlaku: jurnal garansi inti wajib menolak posting bila akun
 * provisi/beban garansi belum di-mapping di SystemSetting (pola AUD-FIN-01
 * customerDownPaymentAccountId), bukan jatuh ke akun tebak.
 */

export type WarrantyCoverage = "part" | "labor"
export type WarrantyKind = "assurance" | "service"

export interface WarrantyClaimFacts {
  /** Garansi tercatat dan klaim di dalam masa berlaku. */
  withinWarranty: boolean
  /** Cakupan yang diklaim pelanggan. */
  coverage: WarrantyCoverage
  /** Jenis garansi menurut PSAK 72 PP28–PP33. */
  kind: WarrantyKind
  /** Keputusan inspeksi: klaim diterima sebagai garansi. */
  claimApproved: boolean
  /** Biaya rework aktual (material FIFO + jasa), rupiah sen-penuh (2 desimal). */
  reworkCost: number
  /** Saldo provisi garansi tersedia untuk job/kontrak asal. */
  provisionBalance: number
  /** Pemulihan dari supplier: belum pasti / mungkin / hampir pasti. */
  supplierRecovery: "none" | "possible" | "virtually_certain"
  /** Nilai pemulihan yang hampir pasti (hanya dipakai bila virtually_certain). */
  supplierRecoveryAmount: number
}

export type JournalSide = "debit" | "credit"

export interface JournalLineDecision {
  /** Kunci akun semantik — di-resolve ke Account.id saat inti dibangun. */
  account: "warranty_provision" | "warranty_expense" | "inventory_or_wip_or_payable" | "supplier_claim_receivable" | "customer_receivable" | "revenue"
  side: JournalSide
  amount: number
  memo: string
}

export interface WarrantyAccountingDecision {
  /** Jalur perlakuan terpilih. */
  path:
    | "covered_warranty" // dalam cakupan: realisasi provisi / beban garansi, tanpa invoice
    | "billable_rework" // di luar cakupan: pekerjaan baru tertagih, invoice normal
    | "rejected_no_cost" // klaim ditolak & belum ada biaya terjadi
  /** true = dilarang menerbitkan SalesInvoice untuk pekerjaan ini. */
  invoiceForbidden: boolean
  /** Baris jurnal (selalu seimbang per konstruksi; lihat test angka). */
  journal: JournalLineDecision[]
  /** Catatan pengakuan yang wajib tampil di dokumen klaim. */
  notes: string[]
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100

/**
 * Putusan jurnal untuk satu klaim garansi. Murni angka: tidak membaca DB.
 *
 * Aturan ringkas:
 * - Tidak dalam garansi ATAU klaim ditolak setelah inspeksi → jalur tertagih:
 *   pelanggan membayar sebagai pekerjaan baru (di luar modul ini: WO+invoice
 *   normal). Bila belum ada biaya & klaim ditolak → tanpa jurnal.
 * - Dalam garansi & diterima → TANPA invoice. Biaya direalisasi dari provisi
 *   sebesar min(biaya, saldo provisi); kelebihan biaya di atas provisi menjadi
 *   Beban Garansi periode berjalan (bukan menggerus provisi di bawah nol, bukan
 *   ditagih ke pelanggan). Recovery supplier hampir-pasti diakui sebagai aset
 *   terpisah dengan kredit ke Beban Garansi, maksimal sebesar biaya garansi
 *   yang dibebankan periode ini + realisasi provisi tidak boleh di-net-off.
 */
export function decideWarrantyClaimAccounting(f: WarrantyClaimFacts): WarrantyAccountingDecision {
  const cost = round2(Math.max(0, f.reworkCost))
  const provision = round2(Math.max(0, f.provisionBalance))

  if (!f.withinWarranty || !f.claimApproved) {
    if (cost <= 0) {
      return {
        path: "rejected_no_cost",
        invoiceForbidden: false,
        journal: [],
        notes: [
          "Klaim di luar masa/cakupan atau ditolak dan belum ada biaya terjadi: tanpa jurnal.",
          "Pekerjaan lanjutan hanya lewat WO + invoice baru normal (bukan dokumen garansi).",
        ],
      }
    }
    return {
      path: "billable_rework",
      invoiceForbidden: false,
      journal: [
        { account: "customer_receivable", side: "debit", amount: cost, memo: "Piutang — rework tertagih di luar garansi (nilai pekerjaan; pajak mengikuti invoice)" },
        { account: "revenue", side: "credit", amount: cost, memo: "Pendapatan — rework tertagih di luar garansi" },
      ],
      notes: [
        "Rework tertagih diperlakukan sebagai penjualan baru: terbit invoice normal, PPN keluaran bila PKP, HPP dari lapisan FIFO saat part keluar.",
        "Dilarang memakai jalur garansi/dokumen klaim untuk pekerjaan tertagih (sumber tertagih dobel F-49).",
      ],
    }
  }

  // Dalam garansi & diterima: invoice terlarang.
  const journal: JournalLineDecision[] = []
  const fromProvision = Math.min(cost, provision)
  const excess = round2(cost - fromProvision)
  if (fromProvision > 0) {
    journal.push({ account: "warranty_provision", side: "debit", amount: fromProvision, memo: "Realisasi provisi garansi — biaya klaim" })
  }
  if (excess > 0) {
    journal.push({ account: "warranty_expense", side: "debit", amount: excess, memo: "Beban garansi — biaya klaim melebihi provisi (periode berjalan)" })
  }
  if (cost > 0) {
    journal.push({ account: "inventory_or_wip_or_payable", side: "credit", amount: cost, memo: "Persediaan/WIP/utang — part & jasa rework garansi pada nilai biaya (FIFO)" })
  }

  const notes: string[] = [
    "Klaim dalam cakupan: tanpa SalesInvoice, tanpa piutang pelanggan, tanpa PPN keluaran atas rework.",
    "Invoice asal TIDAK diubah (WAR-01); biaya tampil di periode klaim dan lifetime cost job asal.",
  ]

  if (f.supplierRecovery === "virtually_certain") {
    const recovery = round2(Math.min(Math.max(0, f.supplierRecoveryAmount), cost))
    if (recovery > 0) {
      journal.push({ account: "supplier_claim_receivable", side: "debit", amount: recovery, memo: "Piutang klaim supplier — garansi part (hampir pasti, PSAK 57)" })
      journal.push({ account: "warranty_expense", side: "credit", amount: recovery, memo: "Pemulihan biaya garansi dari supplier (bukan pendapatan)" })
      notes.push("Recovery supplier hampir pasti diakui sebagai aset terpisah; tidak di-net-off dari provisi di neraca (PSAK 57).")
    }
  } else if (f.supplierRecovery === "possible") {
    notes.push("Recovery supplier belum hampir pasti: tanpa jurnal, ungkapkan sebagai aset kontinjensi (PSAK 57 par 31–35).")
  }

  if (f.kind === "service") {
    notes.push("Garansi jenis service (PSAK 72): pendapatan bagian garansi diakui sepanjang masa jasa dari liabilitas kontrak — bukan dari jurnal klaim ini.")
  }

  return { path: "covered_warranty", invoiceForbidden: true, journal, notes }
}

/**
 * Akrual provisi garansi assurance saat serah-terima/penjualan (PSAK 57).
 * Mengembalikan baris jurnal atau [] bila estimasi tidak andal (=0): dalam hal
 * itu TIDAK ada provisi — biaya dibebankan saat klaim terjadi (jalur
 * covered_warranty dengan provisionBalance 0 di atas).
 */
export function warrantyProvisionAccrual(estimatedCost: number): JournalLineDecision[] {
  const est = round2(Math.max(0, estimatedCost))
  if (est <= 0) return []
  return [
    { account: "warranty_expense", side: "debit", amount: est, memo: "Beban garansi — akrual provisi saat serah-terima (estimasi terbaik PSAK 57 par 36)" },
    { account: "warranty_provision", side: "credit", amount: est, memo: "Provisi garansi — kewajiban kini dari penjualan/serah-terima" },
  ]
}

/** Pembalikan provisi tersisa saat masa garansi berakhir tanpa klaim. */
export function warrantyProvisionRelease(remainingBalance: number): JournalLineDecision[] {
  const bal = round2(Math.max(0, remainingBalance))
  if (bal <= 0) return []
  return [
    { account: "warranty_provision", side: "debit", amount: bal, memo: "Pembalikan provisi garansi — masa garansi berakhir" },
    { account: "warranty_expense", side: "credit", amount: bal, memo: "Pembalikan beban garansi (bukan pendapatan) — PSAK 57" },
  ]
}
