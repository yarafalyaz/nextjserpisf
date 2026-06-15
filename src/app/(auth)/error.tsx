'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { AlertCircle } from 'lucide-react';

export default function AuthError({
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
    <div
      className="w-full flex flex-col items-center justify-center space-y-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Kesalahan Autentikasi</h2>
        <p className="text-sm text-muted-foreground">
          Terjadi masalah saat memproses permintaan autentikasi Anda.
        </p>
      </div>
      <Button onClick={() => reset()} className="w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        Coba Lagi
      </Button>
    </div>
  );
}
