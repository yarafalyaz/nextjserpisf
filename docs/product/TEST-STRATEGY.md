# TEST STRATEGY --- ERP ISF

## 1. Tujuan

Membuktikan requirement dan business rules, mencegah regresi, dan
memastikan transaksi lintas modul konsisten.

## 2. Piramida test

-   Unit: kalkulasi, validasi, lifecycle, permission policy, threshold
    DP, outstanding.
-   Integration: service + database, constraints, transactions,
    rollback, idempotency.
-   API: schema, status codes, unauthorized/forbidden, invalid input,
    duplicate requests.
-   E2E: alur bisnis lintas modul yang penting.
-   Migration: upgrade schema, seed, data integrity, dan prosedur
    recovery.
-   Security: object-level permission, CSRF sesuai auth, file access,
    sensitive data.
-   Performance: endpoint kritis pada dataset/lingkungan representatif.

## 3. Prioritas risiko

**P0:** stok, pembayaran, hutang/piutang, faktur, payroll posting,
permission, audit, data migration.\
**P1:** approval, costing proyek, retur, reporting totals.\
**P2:** UX minor, non-critical dashboard widgets.

## 4. Skenario minimum

1.  Draft receipt tidak mengubah saldo; post menambah stok tepat sekali.
2.  Draft invoice tidak mengubah stok; post mengurangi stock item tepat
    sekali.
3.  Posting gagal melakukan rollback penuh.
4.  Dua posting request untuk dokumen sama tidak menggandakan efek.
5.  Dua penjualan bersamaan untuk stok terbatas mematuhi negative-stock
    policy.
6.  Adjustment belum approved tidak mengubah stok.
7.  Approved adjustment yang diposting menghasilkan ledger dan audit.
8.  Receipt parsial mempertahankan ordered/received/remaining
    quantities.
9.  Pembayaran parsial menghitung outstanding benar.
10. DP draft/gagal tidak dihitung; DP posted mencapai 50% membuat
    konversi sekali sesuai policy.
11. Issue material proyek terhubung ke project/work order dan ledger.
12. Return material hanya masuk kembali setelah verifikasi.
13. Payroll formula memakai komponen yang disetujui dan tidak dapat
    diposting dua kali.
14. User tanpa permission tidak bisa melakukan aksi melalui API.
15. Export mematuhi filter dan permission.
16. Migration menghasilkan saldo opening yang dapat direkonsiliasi.

## 5. Test data

-   Item stock dan non-stock.
-   Beberapa unit dan lokasi.
-   Supplier/customer dengan termin berbeda.
-   Stok nol, stok minimum, stok terbatas.
-   Pembayaran nol/parsial/penuh/lebih bayar sesuai policy.
-   Dokumen draft, approved, posted, cancelled/reversed.
-   Pengguna dengan role berbeda.
-   Data remnant dan scrap. Gunakan data sintetis atau data yang sudah
    dianonimkan.

## 6. Konkurensi dan idempotency

Uji retry setelah timeout, double-click, duplicate webhook/event, dua
user posting bersamaan, alokasi pembayaran bersamaan, dan perubahan
dokumen selama approval.

## 7. CI quality gates

Sesuaikan dengan script repository aktual: - format/lint; - typecheck; -
unit tests; - integration tests; - build; - migration check; -
security/dependency checks sesuai pipeline. Jangan mengklaim test lulus
bila tidak dijalankan. Jangan melemahkan test/typing/permission untuk
meloloskan build.

## 8. Definition of Done test

-   Acceptance criteria memiliki test atau alasan eksplisit mengapa
    tidak otomatis.
-   Test relevan lulus.
-   Regression tests diperbarui.
-   Output test dicatat di PR/task.
-   Bug yang diketahui dan risiko belum selesai dinyatakan secara
    eksplisit.
