"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="id">
      <body className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold text-foreground">Terjadi Kesalahan</h1>
          <p className="text-muted-foreground text-sm max-w-md">
            Aplikasi mengalami masalah yang tidak terduga. Silakan coba lagi.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono">Ref: {error.digest}</p>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Coba Lagi
          </button>
        </div>
      </body>
    </html>
  )
}
