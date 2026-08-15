"use client";

import Sidebar from "./Sidebar";

export default function AdminLayout({
  children,
  title,
  subtitle,
  action,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ marginLeft: 220, flex: 1, minHeight: "100vh" }}>
        <div
          style={{
            padding: "16px 28px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-card)",
            position: "sticky",
            top: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{title}</h1>
            {subtitle && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                {subtitle}
              </p>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                padding: "6px 12px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
              }}
            >
              {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
            {action && <div>{action}</div>}
          </div>
        </div>

        <div style={{ padding: "24px 28px" }}>{children}</div>
      </main>
    </div>
  );
}
