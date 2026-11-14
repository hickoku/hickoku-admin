"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Sidebar from "./Sidebar";

export default function AdminLayout({
  children,
  title,
  subtitle,
  action,
  back,
  badges,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  // Optional "back" link shown before the title, e.g. { href: "/orders", label: "Orders" }.
  back?: { href: string; label: string };
  // Optional status badges shown next to the title.
  badges?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, minWidth: 0, minHeight: "100vh" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 32px 48px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
              {back && (
                <Link href={back.href} className="btn-ghost btn-sm" aria-label={`Back to ${back.label}`} title={`Back to ${back.label}`} style={{ padding: 6, marginTop: 1 }}>
                  <ChevronLeft size={16} />
                </Link>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.3 }}>{title}</h1>
                  {badges}
                </div>
                {subtitle && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</p>}
              </div>
            </div>
            {action && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{action}</div>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
