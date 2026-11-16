---
name: indonesian-tax-accountant
description: "Indonesian tax & accounting domain skill for Coretax DJP, PER-12/PJ/2026 (skema replace), PPN/e-Faktur, e-Bupot Unifikasi, SPT Masa reconciliation, and YaraERP accounting invariants."
user-invokable: true
---

# Indonesian Tax Accountant (`indonesian-tax-accountant`)

Domain skill akuntansi dan perpajakan Indonesia untuk YaraERP (`silengkap`), berbasis regulasi DJP (**PMK 81/2024**, **PER-11/PJ/2025**, dan **PER-12/PJ/2026**) serta aturan pembukuan internal ERP.

---

## 1. Aturan Regulasi Coretax & PER-12/PJ/2026 (Skema *Replace*)

### Kapan Skema *Replace* Berlaku
| Kondisi Masa & Tanggal Lapor | Skema | Perlakuan |
|---|---|---|
| Masa >= `2025-01` **dan** disampaikan >= `2026-10-01` | **Skema *Replace*** | Sampaikan **seluruh isi SPT masa versi terakhir secara utuh**, bukan baris selisih (*delta*). |
| Masa < `2025-01` (2024 ke bawah) | **Aturan Lama** | Ikuti ketentuan masa tersebut. **Dilarang** memakai paket CSV `PEMBETULAN-REPLACE`. |
| Disampaikan < `2026-10-01` | **Aturan Lama (*Delta*)** | Proses *delta* sesuai ketentuan saat penyampaian. **Dilarang** memakai paket `PEMBETULAN-REPLACE`. |

### Mekanisme Kompensasi Coretax
- Pada pembetulan SPT Masa PPh 21/26 dan PPN, Coretax otomatis memperbarui **tabel saldo kompensasi**.
- Selisih penyesuaian dapat **bernilai negatif** dan otomatis diperhitungkan pada **SPT Masa berstatus normal pertama yang disampaikan berikutnya**.
- **Tidak perlu pembetulan berantai** pada masa-masa antara hanya untuk mengejar saldo kompensasi.

---

## 2. Prinsip Pembukuan YaraERP (Larangan Keras)

1. **Period Lock Tidak Pernah Dibuka untuk Pembetulan SPT**
   - `SystemSetting.periodLockDate` ditegakkan oleh `assertPeriodOpen` (`src/lib/services/period-lock.service.ts`).
   - Dilarang membuka kunci periode demi menyelaraskan angka masa lalu dengan Coretax.
2. **Jurnal `POSTED` Bersifat Immutabel**
   - Dilarang mengedit atau menghapus jurnal berstatus `POSTED`.
   - Koreksi pada masa terbuka: gunakan pembalikan `JRN-RV` (`reverseJournalsByReferenceTx`) lalu posting ulang dokumen yang benar.
   - Koreksi pada masa terkunci: buat **jurnal koreksi baru bertanggal periode berjalan** (sesudah `periodLockDate`) dengan referensi masa asal + nomor BPE di deskripsi.
3. **Register `SptFiling` Adalah Append-Only & Non-GL**
   - Mencatat pelaporan (`normal`, `pembetulan-1`, `pembetulan-2`, ...) dan nomor BPE **tidak** membuat jurnal GL dan **tidak** menimpa versi sebelumnya.
   - Angka kurang/lebih bayar dan saldo kompensasi Coretax di register adalah **salinan langsung dari Coretax**, bukan hasil tebakan atau kalkulasi ulang ERP.
4. **Selisih Buku vs Coretax Dijelaskan, Bukan Dipaksa Sama**
   - Selisih antara posisi buku (`rekonsiliasi-ppn` / GL) dan posisi Coretax akibat beda waktu jurnal koreksi periode berjalan atau penyesuaian kompensasi Coretax **adalah wajar**.
   - **Dilarang** membuat jurnal "penyesuaian kompensasi" artifisial agar saldo buku terlihat sama dengan Coretax.
   - Selisih yang **wajib diselidiki**: selisih per buku vs per dokumen pada masa yang sama, dan selisih CSV `PEMBETULAN-REPLACE` vs PDF laporan pada masa yang sama.

---

## 3. Checklist Eksekusi Pembetulan SPT di ERP

1. **Verifikasi Cakupan Skema**: Pastikan masa >= `2025-01` dan tanggal lapor >= `2026-10-01`.
2. **Export Paket Utuh (`PEMBETULAN-REPLACE`)**:
   - Gunakan ekspor CSV *replace* dari `/laporan/faktur-ppn` (memuat seluruh dokumen `posted`/`partial`/`paid` versi kepala rantai efektif masa terkait + retur pengurang masa).
   - Verifikasi **tie-out = Rp0,00** antara total DPP & PPN CSV terhadap PDF `/laporan/faktur-ppn` pada masa yang sama sebelum menyentuh Coretax.
3. **Sampaikan di Coretax & Simpan BPE**: Unduh PDF Bukti Penerimaan Elektronik (BPE) dan catat tanggal/jam penyampaian.
4. **Catat di Register SPT (`SptFiling`)**: Tambah baris versi baru (`pembetulan-n`), nomor BPE, kurang/lebih bayar Coretax, dan saldo kompensasi Coretax sesudah lapor.
5. **Tindak Lanjut Pembukuan & Setoran**:
   - Jika angka buku salah: buat jurnal koreksi periode berjalan (§2.2).
   - Jika ada kurang bayar tambahan: catat `TaxPayment` baru bertanggal bayar aktual dengan `period` = masa yang dibetulkan dan `reference` / `ntpn` / BPE terkait.

---

## 4. Standar Kode & UI Fitur Pajak di YaraERP

- Gunakan `requirePermission()` pada semua halaman & server action, serta daftarkan permission baru di `src/lib/setup/base-data.ts` (jaga `permission-seed-parity.test.ts`).
- Gunakan `tabular-nums` dan `font-mono` untuk NPWP, NIK, nomor faktur pajak, BPE, NTPN, dan nominal uang (`formatCurrencyExact` / `formatAccountingExact`).
- Gunakan ikon Font Awesome dari `@/components/ui/fontawesome-icons`.
- Jangan gunakan em dash (`—`) pada copywriting UI.
- Rujukan SOP lengkap: `docs/sop-pembetulan-spt.md`.
