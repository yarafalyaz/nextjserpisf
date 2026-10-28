# PUTUSAN LEAD 2026-10-28 — Q-120-2: ambang tampil daftar tagih vs lunas-dalam-toleransi

- ID pertanyaan: Q-120-2 (spec F-2026-10-28-120-S SAL-BR-011 §5; gerbang kerja Backend "samakan derivasi + ambang tampil").
- Pemutus: BOT Lead. Basis verifikasi: `origin/main` `d6cf442ba` (28 Okt 2026, WIB).
- Tanpa kode, tanpa skema, tanpa migrasi, tanpa jurnal. Dokumen saja.

## Putusan

**DIPUTUS: ambang tampil "belum lunas" = `outstanding > SETTLEMENT_TOLERANCE_IDR` (Rp1).**
Faktur bersisa `<= Rp1` (lunas-dalam-toleransi, status `paid` FIN-BR-006) **TIDAK tampil**
sebagai tagihan di permukaan mana pun: aging, statement, antrean penagihan, eksposur
kredit, subledger, ringkasan AR/AP, tukar-faktur. Daftar tagih = himpunan yang benar
ditagih = komplemen himpunan lunas-dalam-toleransi.

## Alasan

1. Selaras status: dokumen `paid` tidak ditagih lagi. Dua keputusan (status vs tampil)
   memakai satu ambang yang sama — satu faktur, satu kebenaran.
2. Batas akuntansi mengikat (vonis F-2026-10-28-123-V Putusan 5): sisa `<= Rp1`
   **dilarang** ditagih atau dinyatakan menunggak di dokumen eksternal mana pun.
   Menampilkannya sebagai tagihan = pelanggaran vonis, bukan pilihan tampilan.
3. Basis live sudah begitu di permukaan yang sudah diparitas: antrean penagihan
   (`collection-queue.ts:344` `isOutstandingSettled(sisa)` → skip), statement
   (`customer-statement.ts:255`), terkirim-belum-ditagih, histori proses jual/beli,
   antrean tukar faktur lewat batas. Yang belum seragam adalah divergensi
   terverifikasi D1/D2 spec 120-S (aging `outstanding <= 0`, ringkasan AR/AP float
   mentah `> 0`) — itulah pekerjaan Backend yang gerbangnya putusan ini.
4. Rekomendasi Business (`> Rp1` + label status tampil) diterima penuh.

## Yang tetap berlaku untuk permukaan histori/detail

Pada permukaan yang memang menampilkan baris faktur lunas-dalam-toleransi
(statement pelanggan, histori, detail), label wajib vonis 123-V Putusan 5:
`Lunas (sisa pembulatan RpX dalam toleransi)`, X = sisa mentah presisi sen.
Dilarang label `belum lunas`/`menunggak`/`terbuka`; dilarang menampilkan sisa
sebagai Rp0.

## Konsekuensi

- E120-1 berlaku penuh: faktur Rp999.999,50 dibayar Rp999.999 → status `paid`
  DAN hilang dari daftar tagihan.
- Backend: seragamkan D1/D2/D5 ke `isOutstandingSettled()` + `receivableOutstanding`
  (gerbang §6 vonis 123-V, tanpa mesin lunas baru, tanpa schema/migrasi).
- Frontend: konsumen label Putusan 5 sesudah Backend merged; tanpa hitung ulang.
- QA: E120-1..6 + E123-1..7 atas head implementasi persis.
- INDEKS-ATURAN FIN-BR-006: **tidak berubah** (barisnya sudah berbunyi
  "sisa <= Rp1 = lunas di SEMUA permukaan"; putusan ini perilaku tampil,
  bukan perubahan status baris).
