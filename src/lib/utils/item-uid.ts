/**
 * Generator kunci baris (React `key`) untuk form dokumen berbaris-item.
 *
 * Baris item belum punya id database sebelum disimpan, jadi tiap form dokumen
 * memakai uid klien sebagai `key`. Sebelumnya helper ini disalin di delapan form
 * dengan counter masing-masing (`let itemUidSeq = 0`); sekarang satu counter
 * modul bersama supaya uid unik antartabel yang hidup di halaman yang sama.
 *
 * Format sengaja dipertahankan `row-N`, dan uid selalu dibuang sebelum dikirim
 * ke server action (`map(({ uid: _uid, ...rest }) => rest)`), jadi nilainya tidak
 * pernah bocor ke payload maupun ke database.
 */
let itemUidSeq = 0

export const nextItemUid = () => `row-${++itemUidSeq}`
