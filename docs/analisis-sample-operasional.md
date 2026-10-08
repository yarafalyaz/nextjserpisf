# Analisis Dokumen Sample Operasional → Penerapan di Silengkap

Sumber: `sample/` (12 dokumen riil operasional IRONSMITH FABRICATION / ISF).
Tujuan: memetakan pola nyata yang dipakai sehari-hari supaya sistem ERP meniru
cara kerja mereka, bukan sebaliknya.

---

## 1. Ringkasan tiap dokumen & polanya

| # | File | Jenis | Pola kunci |
|---|------|-------|------------|
| 1 | `PETTY CASH 2026 (Update).xlsx` | Jurnal kas kecil per bulan | Tanggal · Deskripsi · Masuk · Keluar · Saldo berjalan. Ada penarikan tunai dari kas besar → kas kecil. |
| 2 | `JURNAL OPERASIONAL JANUARI 2026.xlsx` | Jurnal operasional harian | **NO. BUKTI · Tanggal · Deskripsi · NAMA PROJECT · VENDOR · Kategori · Qty · Harga Satuan · Total**. 44 kategori biaya, 106 vendor, 41 nama project. |
| 3 | `Cash Flow April 2026.xlsx` | Mutasi kas/bank | Tanggal · Deskripsi · DEBIT · KREDIT · SALDO · Keterangan. Entri "CANCEL" (pembatalan transfer/pembelian). |
| 4 | `CATATAN PINJAMAN KARYAWAN AGUSTUS 2025.xlsx` | Kasbon karyawan | Nominal pinjaman · cicilan per minggu/ bulan (potong gaji) · sisa · status (CLEAR/LUNAS) · catatan tabungan karyawan. |
| 5 | `PENDANAAN (DANA TALANGAN).xlsx` | Dana talangan / bagi hasil | Dana masuk (kredit) untuk mesin Laser Cut, cicilan bagi hasil per bulan (52.083.333). "Rekap Dana Bagi Hasil". |
| 6 | `Rekap Token Listrik.xlsx` | Rekap biaya berulang | Token listrik per bulan (Jan–Apr) + total bulanan. |
| 7 | `Mutasi Rekening BCA April 2026.pdf` | Mutasi bank riil (49 hal) | TRSF E-BANKING · BI-FAST · **BIAYA TXN 2.500** · **BIAYA ADM 14.000** · BUNGA · PAJAK BUNGA. |
| 8 | `QUO-Bpk. Herdy.pdf` | Quotation | Header (No QUO, tanggal, kepada, kendaraan, no.pol, metode bayar/kirim) · item + deskripsi multibaris · DP 50% · timeline · rekening BCA. |
| 9 | `Update INV - Bpk. Vai.pdf` | Invoice | **Section grouping** (Front/Top/Rear/Suspension) · kolom **DISCOUNT** · item **FREE** (harga 0). |
| 10 | `WO Bpk Saladin.pdf` | Work Order | Customer · Order No · tgl order/mulai/selesai · jenis kendaraan · **marketing** · plat · supervisor · pengiriman · rincian pekerjaan. |
| 11 | `FORM SURAT JALAN-new.docx` | Surat jalan | Kepada · tgl serah · jenis kendaraan · No.Polisi · tabel barang · tanda tangan penerima & mengetahui. |

---

## 2. Gap terhadap sistem saat ini

Sudah ada modul: `kas-kecil` (PettyCash), `pengeluaran` (Expense + ExpenseCategory),
`rekonsiliasi-bank`/`laporan-bank` (BankStatement + BankReconciliation),
`pinjaman` (SDM), `proyek` (Project), `pembelian`, `penjualan` + quotation/invoice.

Yang **belum** / belum pas:

1. **Biaya admin bank otomatis** — sudah dikerjakan di penerimaan (`97f28102`) dan
   pembayaran vendor (`10b601a4`). Belum ada import mutasi bank → auto-catat
   `BIAYA TXN 2.500` / `BIAYA ADM 14.000` dari PDF BCA.
2. **Nama Project pada pengeluaran** — jurnal operasional selalu menautkan
   biaya ke "Pak Sagita / Kantor / Stok / ISF Metal Cut". `Expense` sudah punya
   `projectId`, tapi belum dipakai luas untuk pelabelan beban per project/customer.
3. **Kategori biaya granular** — 44 kategori (Belanja Dapur, Supporting Part,
   Jasa Coating, Jasa Laser Cutting, dst). Perlu dipastikan `ExpenseCategory`
   ter-seed lengkap mengikuti daftar ini.
4. **Section grouping di penawaran/invoice** — invoice ISF dikelompokkan
   Front/Top/Rear/Suspension Section. Cek apakah item sudah punya field "section".
5. **Item FREE & DISCOUNT per baris** — invoice punya baris FREE (harga 0) dan
   kolom diskon per baris.
6. **Dana talangan / bagi hasil** — `PENDANAAN` belum ada modulnya (pendanaan
   pihak ketiga dengan cicilan bagi hasil).
7. **Rekap biaya berulang** (token listrik) — praktik di luar sistem; bisa
   ditangani lewat pengeluaran berulang.

---

## 3. Rekomendasi prioritas (bertahap)

### Prioritas tinggi (langsung menghemat kerja)
- **A. Seed kategori biaya operasional** lengkap (44 kategori) → agar dropdown
  pengeluaran mirip cara kerja tim keuangan.
- **B. Tautkan pengeluaran ke Proyek/Nama Project + Vendor** pada form
  pengeluaran & kas kecil (label "Nama Project" & "Vendor" seperti jurnal).
- **C. Biaya admin bank dari mutasi** — fasilitasi input biaya bank
  (BIAYA TXN / BIAYA ADM) pada rekonsiliasi bank.

### Prioritas menengah
- **D. Section grouping** pada item penjualan (Front/Top/Rear/Suspension) +
  laporan per section.
- **E. Item FREE & diskon per baris** pada invoice (sudah ada diskon header).

### Prioritas rendah / pantau
- **F. Modul Dana Talangan / bagi hasil**.
- **G. Import mutasi BCA (PDF) → draft transaksi bank**.

---

## 4. Status

- Tahap ini: **pemetaan & analisis** (dokumen ini).
- Belum ada perubahan kode. Menunggu pilihan prioritas pemilik.
