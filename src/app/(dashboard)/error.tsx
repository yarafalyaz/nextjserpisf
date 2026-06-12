'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl border border-gray-100 text-center shadow-sm">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Gagal Memuat Halaman</h2>
        <p className="text-gray-500 mb-6 text-sm">
          Terjadi kesalahan saat memuat data di modul ini. Silakan coba muat ulang atau kembali ke dashboard utama.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => reset()}>
            Muat Ulang Modul
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
            Ke Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
