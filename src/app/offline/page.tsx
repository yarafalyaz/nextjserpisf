import { AlertTriangle, RotateCcw } from "@/components/ui/fontawesome-icons"

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px",
        textAlign: "center",
        backgroundColor: "var(--background, #ffffff)",
        color: "var(--foreground, #18181b)",
        fontFamily:
          'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style>{`
        .offline-card {
          width: 100%;
          max-width: 24rem;
          border-radius: 8px;
          border: 1px solid var(--border, #e4e4e7);
          background-color: var(--card, #ffffff);
          padding: 24px;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .offline-icon-wrap {
          display: flex;
          width: 48px;
          height: 48px;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background-color: var(--muted, #f4f4f5);
          color: var(--muted-foreground, #71717a);
        }
        .offline-title {
          margin: 0;
          font-size: 1.125rem;
          line-height: 1.4;
          font-weight: 600;
          color: var(--foreground, #18181b);
        }
        .offline-desc {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.5;
          color: var(--muted-foreground, #71717a);
        }
        .offline-reload-btn {
          display: inline-flex;
          width: 100%;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid transparent;
          border-radius: 6px;
          background-color: var(--primary, #18181b);
          color: var(--primary-foreground, #fafafa);
          padding: 10px 16px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
        }
        .offline-reload-btn:focus-visible {
          outline: 2px solid var(--ring, #18181b);
          outline-offset: 2px;
        }
        html.dark .offline-card {
          border-color: var(--border, #27272a);
          background-color: var(--card, #121215);
        }
        html.dark .offline-icon-wrap {
          background-color: var(--muted, #27272a);
          color: var(--muted-foreground, #a1a1aa);
        }
        html.dark .offline-title {
          color: var(--foreground, #fafafa);
        }
        html.dark .offline-desc {
          color: var(--muted-foreground, #a1a1aa);
        }
        html.dark .offline-reload-btn {
          background-color: var(--primary, #fafafa);
          color: var(--primary-foreground, #18181b);
        }
      `}</style>
      <div className="offline-card">
        <div className="offline-icon-wrap">
          <AlertTriangle size={20} style={{ width: "20px", height: "20px" }} aria-hidden="true" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 className="offline-title">Koneksi Internet Terputus</h1>
          <p className="offline-desc">
            Periksa jaringan seluler atau Wi-Fi Anda, lalu muat ulang untuk melanjutkan transaksi ERP.
          </p>
        </div>
        <form method="GET" style={{ width: "100%" }}>
          <button type="submit" className="offline-reload-btn">
            <RotateCcw size={16} style={{ width: "16px", height: "16px" }} aria-hidden="true" />
            Muat Ulang
          </button>
        </form>
      </div>
    </main>
  )
}
