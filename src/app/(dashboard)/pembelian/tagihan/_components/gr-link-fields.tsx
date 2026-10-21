"use client";

import { useEffect, useRef } from "react";

/**
 * Menyuntikkan bidang tersembunyi `goodsReceiptId` ke dalam form yang dirender
 * anak-anaknya, supaya jalur "Buat Tagihan dari Penerimaan"
 * (`/pembelian/tagihan/tambah/penerimaan/<slug>`) bisa memberitahu server action
 * `createVendorBill` penerimaan mana yang ditagih.
 *
 * Kenapa lewat DOM, bukan field biasa di form: form tagihan
 * (`src/components/forms/vendor-bill-form.tsx`) dipakai bersama oleh jalur buat
 * biasa, jalur "dari PO", dan halaman ubah; menambah field khusus-GR di sana
 * berarti mengubah kontrak form untuk semua pemakainya, sedangkan halaman ini
 * tidak boleh menyentuh berkas itu. Bidang disembunyikan (bukan input yang
 * terlihat) karena nilainya bukan milik operator — ia datang dari URL dan hanya
 * validasi server yang menentukan.
 *
 * `new FormData(form)` membaca elemen yang benar-benar terpasang di dalam form,
 * jadi bidang yang disisipkan di sini ikut terkirim.
 */
export function GoodsReceiptLinkFields({
  goodsReceiptId,
  children,
}: {
  goodsReceiptId: number;
  children: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = hostRef.current?.querySelector("form");
    if (!form) return;

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "goodsReceiptId";
    input.value = String(goodsReceiptId);
    form.appendChild(input);

    return () => {
      input.remove();
    };
  }, [goodsReceiptId]);

  return <div ref={hostRef}>{children}</div>;
}
