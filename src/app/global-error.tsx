'use client';

import { Inter } from 'next/font/google';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/shadcn/button';
import { AlertCircle } from 'lucide-react';

const inter = Inter({ subsets: ['latin'] });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Sama seperti error.tsx: navigasi internal lewat router, bukan `window.location.href`.
  // D17: halaman ini dirender di luar tema aplikasi (tanpa provider tema), jadi
  // pakai warna yang terbaca di terang maupun gelap — bukan gray-50/white murni.
  const router = useRouter();
  return (
    <html lang="id">
      <body className={inter.className}>
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 dark:bg-gray-900">
          <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-red-100 text-center dark:border-red-900 dark:bg-gray-800">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center dark:bg-red-950">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2 dark:text-gray-100">Terjadi Kesalahan Fatal</h2>
            <p className="text-gray-500 mb-6 text-sm dark:text-gray-400">
              Sistem mendeteksi kesalahan yang tidak terduga. Tim teknis telah diberitahu.
              <br />
              {error.digest ? <span className="text-xs text-gray-400 mt-2 block dark:text-gray-500">Kode Ref: {error.digest}</span> : null}
            </p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => reset()} className="w-full">
                Coba Lagi
              </Button>
              <Button variant="outline" onClick={() => router.push('/')} className="w-full">
                Kembali ke Beranda
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
