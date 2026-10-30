// R6WN-10: sebagian pemanggil mengirim path route sebagai body
// (mis. notifyAdmins("Penawaran diterima pelanggan", "/penjualan/penawaran/5")).
// Tampilkan sebagai link daripada teks polos. Path lain tetap teks.
// ponytail: tanpa penanda eksplisit, dayakan hanya root path tunggal;
// upgrade ke kolom url khusus bila pemanggil butuh URL + label bebas.
const PATH_BODY = /^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/

export function notificationBodyHref(body: string): string | null {
  return PATH_BODY.test(body) ? body : null
}
