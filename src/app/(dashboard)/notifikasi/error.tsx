"use client"

export default function ModuleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="max-w-md w-full bg-surface rounded-xl border border-default shadow-sm p-6 text-center">
        <h2 className="text-lg font-bold mb-2">Terjadi Kesalahan</h2>
        <p className="text-sm text-muted-foreground mb-4">{error.message || "Silakan coba lagi"}</p>
        <button onClick={reset} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">Coba Lagi</button>
      </div>
    </div>
  )
}
