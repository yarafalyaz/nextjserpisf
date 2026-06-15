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
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm"
        role="alert"
        aria-live="assertive"
      >
        <div className="mb-4 flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/15">
            <AlertTriangle className="size-8 text-amber-500" />
          </div>
        </div>
        <h2 className="mb-2 text-xl font-semibold text-foreground">Gagal Memuat Halaman</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Terjadi kesalahan saat memuat data di modul ini. Silakan coba muat ulang atau kembali ke dashboard utama.
        </p>
        {error.digest ? (
          <p className="mb-6 text-xs text-muted-foreground/70">Kode Ref: {error.digest}</p>
        ) : null}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => reset()}>Muat Ulang Modul</Button>
          <Button variant="outline" onClick={() => { window.location.href = '/' }}>
            Ke Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
