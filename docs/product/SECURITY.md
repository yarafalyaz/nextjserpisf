# SECURITY --- ERP ISF

## 1. Prinsip

Security by default, least privilege, backend authorization,
auditability, dan minimisasi data sensitif.

## 2. Identity dan session

-   Audit mekanisme auth aktual sebelum mengubahnya.
-   Password dikelola sendiri harus di-hash dengan algoritma modern yang
    direkomendasikan.
-   Session/token memiliki expiry, revocation, dan penyimpanan aman.
-   Lindungi login dan reset password dari brute force.
-   MFA dapat dipertimbangkan untuk role admin/finance; statusnya
    keputusan scope.

## 3. Authorization

-   Backend memeriksa permission untuk setiap endpoint dan aksi.
-   Role mengelompokkan permission granular.
-   Periksa object-level access, bukan hanya akses modul.
-   Pisahkan permission read, create, update, approve, post,
    cancel/reverse, export, dan admin.
-   Uji akses forbidden untuk semua endpoint sensitif.
-   Pengusul tidak boleh menjadi approver sendiri jika kebijakan
    separation-of-duties mengharuskannya.

## 4. Data sensitif

-   Batasi payroll, data personal karyawan, informasi customer, dan data
    finansial.
-   Jangan masukkan secret/token/password ke log.
-   Ekspor mengikuti permission dan memiliki kontrol akses file.
-   Tentukan retensi dokumen dan data sesuai kebutuhan
    hukum/operasional.
-   Gunakan data minimization pada response API.

## 5. Web/API security

-   Validasi semua input di server.
-   Terapkan proteksi CSRF sesuai model cookie/session.
-   Batasi CORS ke origin yang diizinkan.
-   Gunakan parameterized query/ORM yang aman.
-   Rate limit endpoint login, reset, dan aksi berisiko.
-   Validasi file upload: ukuran, tipe, nama, dan akses.
-   Gunakan security headers sesuai deployment.
-   Jangan mempercayai data harga, total, saldo, role, atau status dari
    client tanpa validasi.

## 6. Transaksi dan audit

-   Posting finansial/stok bersifat atomik.
-   Proteksi replay/double-submit.
-   Audit aksi login penting, perubahan role, approval, posting,
    cancel/reversal, dan ekspor sensitif.
-   Audit trail tidak dapat diubah melalui UI operasional.
-   Jangan menghapus transaksi posted untuk "memperbaiki" data.

## 7. Secrets dan deployment

-   Secret disimpan di environment/secret manager, bukan repository.
-   Pisahkan konfigurasi development/test/production.
-   Database tidak diekspos ke internet tanpa kebutuhan dan proteksi.
-   Gunakan TLS untuk koneksi eksternal.
-   Backup dilindungi dan akses restore dibatasi.
-   Dependency/security scanning dijalankan sesuai pipeline proyek.

## 8. Incident dan recovery

-   Tentukan owner insiden, proses rotasi secret, backup, restore, dan
    komunikasi.
-   Uji restore berkala.
-   Tetapkan RPO/RTO dan retensi sebelum production.
-   Catat incident tanpa menyalin data sensitif berlebihan.

## 9. Security acceptance checklist

-   Unauthorized request ditolak.
-   Authenticated user tanpa permission mendapat forbidden.
-   User tidak dapat membaca/mengubah object di luar aksesnya.
-   Retry posting tidak menggandakan transaksi.
-   Secret tidak muncul di log/build artifact.
-   Export/file tidak dapat diakses tanpa otorisasi.
-   Perubahan role, approval, dan posting memiliki audit trail.
