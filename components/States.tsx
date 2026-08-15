export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 16 }}>
      <div className="spinner" style={{ width: 24, height: 24 }} />
      <p style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-mono)" }}>{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 16 }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--accent-red-glow)",
          border: "1px solid rgba(229,72,77,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
        }}
      >
        ⚠
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "var(--accent-red)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Error</p>
        <p style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{message}</p>
      </div>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = "No data found" }: { message?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 12 }}>
      <div style={{ fontSize: 32, opacity: 0.3 }}>○</div>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{message}</p>
    </div>
  );
}
