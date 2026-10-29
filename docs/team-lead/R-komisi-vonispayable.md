# Vonis desain CommissionPayable — komisi penjualan tahap 3

Tanggal: 2026-10-29. Sifat: RISET SAJA. Nol kode, nol prisma, nol migrasi.
Keputusan ini membekukan kontrak tahap 3 (utang komisi + jurnal + bayar via payroll).
Pembangunan hanya sah sesudah gerbang §0 terpenuhi.

## 0. Status kini & gerbang buka

- Live: snapshot persen beku saat transisi `paid` (`SalesInvoice.commissionRatePercent`,
  `commissionCustomerCategoryId`, `commissionRateId`, resolusi per tanggal faktur),
  histori tarif `CustomerCommissionRate` per kategori bertanggal efektif,
  rekap informatif paid-only + read-model saldo (`ledgerAvailable: false`, saldo 0 jujur).
- Belum live: akun 210212 (grep `base-data.ts` = 0), mapping
  `commissionExpenseAccountId`/`commissionPayableAccountId` (grep schema = 0),
  hook akrual/lawan/bayar, model subledger fisik.
- Gerbang (dari vonis F-084-V / spec 037-S / 039-V): G1 PUTUSAN Lead buka inti
  + G2 inti 036-S live + seed 210212/mapping satu paket dengan penjaga fail-closed
  (dilarang merged terpisah tanpa penjaga — akun yatim = celah).

## 1. Basis komisi: LUNAS, bukan terbit — FINAL

- Hak komisi lahir HANYA pada transisi faktur ke `paid` (lunas penuh).
  Bukan saat terbit/`draft`/`sent`/`posted`, bukan `partial`, bukan saat rekap dibaca.
- Alasan: komisi = hak atas uang masuk, bukan atas piutang. Fakur `posted` belum
  tentu terbayar; akrual saat terbit mencatat utang atas kas yang belum ada.
- Basis per faktur = DPP snapshot = `grandTotal − taxAmount` (vonis F-056-V Putusan 2,
  BR-KT36-05). Faktur tanpa PPN (`taxAmount` 0) = basis `grandTotal` penuh.
  Dilarang: tarif PPN berjalan, subtotal mentah, `Number()` mentah atas Decimal.
- Persen = snapshot `commissionRatePercent` beku saat transisi paid, hasil resolusi
  histori per TANGGAL FAKTUR (`effectiveFrom <= tgl < effectiveTo`, null = terbuka).
  Faktur lama tanpa snapshot = 0 jujur, tanpa backfill (BR-KT36-13).
- Penjual null = nol akrual, masuk ember `unattributed` (tak ditebak dari `createdBy`).
- Satu penjual per faktur (snapshot existing). Split multi-penjual = model terpisah,
  tidak dikarang di sini.
- `SalesTarget`: pencapaian memakai basis IDENTIK (faktur `paid`, `date` dalam periode,
  per snapshot `salesEmployeeId`; tanpa prorata). Target dan komisi satu basis, dua laporan.

## 2. Rumus mengikat

- Akrual per (faktur, penerima) = `safeRound(DPP × persenSnapshot / 100)`, sen-persis
  lewat `src/lib/utils/math`. Contoh: DPP 11.000.000 × 2% = 220.000 (bukan 246.400
  basis grandTotal).
- Saldo per baris = `accrued − reversal − paid`. Saldo penerima = Σ baris.
  Rekonsiliasi tiga arah wajib: Σ saldo subledger == saldo GL 210212 POSTED
  (Σ kredit − Σ debit); per faktur sampel A == jurnal akrual, Σ lawan == jurnal lawan,
  Σ tautan bayar == debit 210212 jurnal slip; subledger vs rekap informatif direkonsiliasi
  per faktur beralasan, tidak disamakan paksa (rekap bukan utang, BR-KOM37-12).

## 3. Pajak komisi (PPh) — FINAL per 039-V §5 / F-084-V §5

- Penerima karyawan = penghasilan TIDAK TERATUR. Lahir sebagai penghasilan pada MASA
  DIBAYAR lewat slip payroll, bukan saat akrual. Akrual (Dr 600002 / Cr 210212) bruto
  penuh — PPh Rp0 di jurnal akrual. Akrual neto = MERAH.
- PPh 21 dihitung TER atas GABUNGAN bruto masa bayar (PMK 168/2023 Pasal 5/8/10),
  di jurnal slip masa bayar. Bukan tarif komisi sendiri.
- Bukan PPh 23 untuk karyawan (jasa yang dipotong PPh 21 dikecualikan dari PPh 23).
  Penerima non-Employee = di luar tahap 3 (butuh master penerima + bupot bukan-pegawai
  terpisah bila bisnis membuktikan kebutuhan).
- Komisi bukan objek PPN. BPJS ikut vonis basis upah existing (komisi tidak tetap
  tidak masuk basis rutin; komisi tetap berkala = vonis baru).
- Jalur bayar tunai terpisah di luar payroll untuk karyawan DILARANG.

## 4. Akun Dr/Cr — FINAL per 039-V

| Peristiwa | Dr | Cr | Nominal |
|---|---|---|---|
| Akrual (transisi → `paid`) | 600002 Beban Komisi (existing) | 210212 Utang Komisi Penjualan (BARU, OCLY/2102) | DPP × persen snapshot |
| Lawan retur `completed` | 210212 | 600002 | returnDpp snapshot × persen faktur asal, masa retur |
| Bayar via slip payroll tertaut | 210212 | komponen payroll (`onPayrollPaid`) | nominal komponen slip |

- 210207 = Utang Kompensasi PKWT (F-132-V): DILARANG untuk komisi.
- 210208 (pesangon), 210209 (reimbursement), 210210 (PPh 21), 210211 (BPJS): DILARANG reuse.
- Fallback ke 210204/210205/210206/210207/210208/210209/210210/210211 DILARANG mutlak.
- Mapping `commissionExpenseAccountId` + `commissionPayableAccountId` di SystemSetting:
  nullable, tanpa default tebak. Kosong/nonaktif/salah tipe/debit==kredit = posting
  DITOLAK berisik, nol jurnal setengah, nol baris subledger setengah. Penjaga berbasis
  mapping + tipe akun aktif, BUKAN hardcode `code === "210212"` (instalasi boleh menomori
  ulang COA selama mapping menunjuk akun OCLY aktif miliknya).
- Beban diakui SEKALI di akrual. Jurnal slip mendebit 210212, bukan 600002 kedua kali.

## 5. Momen posting — FINAL

- Akrual: SATU transaksi = transisi faktur → `paid` + snapshot persen/kategori +
  baris subledger + jurnal Dr 600002 / Cr 210212. Syarat lahir: penjual tidak null,
  snapshot persen ada, hasil > 0, mapping lengkap. Satu syarat gagal = nol baris +
  nol jurnal berlabel alasan; faktur tetap `paid` (empat status terpisah).
- Tanggal jurnal = tanggal transisi paid + `assertPeriodOpen` dalam tx yang sama.
  Periode terkunci = DITOLAK, tanggal TIDAK digeser (fakta tertunda berlabel, bukan
  jurnal tanggal palsu).
- Idempotensi: kunci unik pasangan (faktur, penerima) + klaim referensi jurnal
  (`Journal.activeReferenceKey` / `assertJournalClaimRef`). Retry/replay pembayaran
  terakhir TIDAK melahirkan baris/jurnal kedua.
- Lawan retur: tanggal = tanggal retur `completed` (masa retur, bukan restate masa akrual).
  Jurnal asal + baris akrual asal TIDAK diubah/dihapus.
- Bayar: komponen komisi di slip `draft`/belum paid TIDAK mengurangi saldo. Tautan
  bayar + jurnal slip dalam satu tx saat slip → `paid`.

## 6. Edge — putusan

| Edge | Putusan |
|---|---|
| `partial` / DP / alokasi kredit parsial | NOL akrual. `commissionSnapshotForPaid(goingPaid=false)` = `{}`. Snapshot beku hanya saat lunas penuh. |
| Faktur dibatalkan sesudah `paid` | Reversal penuh mekanisme jurnal repo (asal REVERSED + jurnal lawan), `assertPeriodOpen` tanggal asal. |
| Retur `completed` (parsial/penuh) | Jurnal lawan Dr 210212 / Cr 600002 di masa retur. Penjaga kumulatif dalam tx: R sesudah tulis ≤ A; lawan yang melewati A = DITOLAK berisik (bukan dipotong diam-diam). |
| Retur `draft`/belum completed | NOL lawan. Status retur = gerbang, bukan tanggal. |
| Retur tanpa `salesInvoiceId` / faktur asal di luar periode | Tak tertaut = tak mengurangi siapa pun. Tanpa tebak penerima. |
| Komisi terbayar lalu retur lahir | Lawan tetap terbit; saldo penerima BOLEH NEGATIF tercatat (tanpa clamp 0, tanpa tarik kas otomatis). Pulih lewat potongan komisi/payroll berikutnya oleh proses payroll berizin. |
| Jalur slip ciptakan overpaid sendiri | DILARANG. Overpaid hanya boleh lahir dari urutan retur-sesudah-bayar. P sesudah tulis ≤ A − R, kecuali pengecualian itu. |
| Penjual null | Nol akrual + nol baris. Faktur tetap `paid`. |
| Snapshot null (faktur legacy) | Estimasi 0 jujur, tanpa backfill dari histori berjalan. |
| Mapping kosong / akun nonaktif / salah tipe | Fail-closed berisik ke Pengaturan; nol jurnal, nol baris; faktur tetap `paid` berlabel akrual-tertunda-alasan. |
| Karyawan penerima berhenti sebelum dibayar | Utang TETAP tercatat atas namanya. Selesai lewat slip terakhir/proses payroll existing atau penagihan manual berizin. Sistem tidak menghapus utang karena status karyawan berubah. |
| Approval manual atas hak | TIDAK ADA tahap ini. Hak lahir dari dokumen (faktur lunas + snapshot), bukan persetujuan bebas. Approval tambahan = BUTUH-VONIS Lead. |
| Nominal lintas-penjual | Data penghasilan terlindungi: baca lintas-penjual hanya izin laporan + cakupan server; slip hanya `process_payroll` + `getHrScope` fail-closed. |

## 7. Tabel kolom draft (KONTRAK, bukan prisma — fisik milik Backend sesudah G1)

Satu dokumen subledger per pasangan (faktur, penerima). Jurnal agregat per periode
sebagai satu-satunya catatan DITOLAK (tak menjawab: utang ke siapa, dari faktur mana,
dibayar slip mana, retur mengurangi siapa).

| Kolom | Tipe | Aturan |
|---|---|---|
| id | autoincrement | PK |
| salesInvoiceId | FK SalesInvoice | wajib; bagian kunci unik |
| salesEmployeeId | FK Employee | wajib; bagian kunci unik; `@@unique([salesInvoiceId, salesEmployeeId])` |
| accruedAmount | Decimal 15,2 | bruto snapshot DPP × persen; > 0 saat lahir |
| reversalAmount | Decimal 15,2 | default 0; kumulatif lawan; penjaga R ≤ A dalam tx |
| paidAmount | Decimal 15,2 | default 0; kumulatif tautan bayar-slip |
| balance | turunan `A − R − P` | DILARANG kolom bebas/input operator; boleh negatif (retur-sesudah-bayar) |
| status | turunan server | ACCRUED / PARTIALLY_PAID / PAID / REVERSED / OVERPAID_NEGATIVE (aturan §subledger builder existing) |
| accrualJournalId | FK Journal | jurnal akrual tertaut |
| reversalJournalIds | relasi | jurnal-jurnal lawan tertaut |
| payrollLineRefs | relasi | komponen slip tertaut per bayar |
| createdBy / timestamps | standar repo | jejak tulis; baca tidak menulis |

- Status baris DITURUNKAN server dari (A, R, P), bukan kolom bebas, bukan input operator.
- Rekap informatif tahap 2 TETAP informatif; label permukaan utang terpisah
  ("utang komisi tercatat dari jurnal"). Dilarang mengganti label rekap lama seolah
  estimasinya kini utang.

## 8. Estimasi: M

- M satu paket (tak terpisah): seed 210212 + 2 mapping nullable + automap saran
  kode-persis + penjaga fail-closed + hook akrual/lawan/bayar satu-tx + subledger
  per (faktur, penerima) + loader saldo + QA falsifikasi (KOM3 + AC-KOM37 + QA-KOM39).
- Urutan dalam paket bebas, tetapi seed akun/mapping DILARANG merged terpisah tanpa
  penjaganya. Tanpa backfill akrual historis; tanpa split multi-penjual; tanpa slip
  komisi di luar payroll.

## 9. Rujukan (terverifikasi run ini)

- `prisma/schema.prisma:564-578` histori tarif; `:1811-1818,1847-1848` snapshot faktur;
  `:6030-6038` status invoice; `:6279-6300` SalesTarget; `:104-343` SystemSetting
  (mapping komisi = 0); `:2077-2187` SalesPayment/SalesReturn.
- `src/lib/services/commission-snapshot.ts` (beku saat paid, fail-soft 0);
  `src/lib/services/customer-commission-rate.service.ts` (resolusi per tanggal faktur).
- `src/lib/reports/sales-commission.ts` + `sales-commission-data.ts` (paid-only, DPP,
  retur masa retur); `sales-commission-payable.ts` + `sales-commission-payable-data.ts`
  (`ledgerAvailable: false` jujur); `sales-commission-subledger*.ts` (status turunan).
- `src/lib/setup/base-data.ts:930` 600002 ada; `:1026-1035` 210207/210209/210210/210211
  terpakai; 210212 = 0 (bebas).
- Backlog: F-084-V (perlakuan tahap 3), 039-V (akun final 210212), 049-V (bentuk subledger),
  spec 037-S §2/§5/§10 + BR-KOM37 + AC-KOM37 + QA-KOM39 (kontrak workflow).
