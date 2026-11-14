"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Package, Users, ImageIcon, LogOut, Plus, Settings, Tag, TicketPercent } from "lucide-react";

const NAV = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Orders", href: "/orders", icon: Package },
  { label: "Customers", href: "/customers", icon: Users },
];

const CONTENT_NAV = [
  { label: "Products", href: "/products", icon: Tag },
  { label: "Offers", href: "/offers", icon: TicketPercent },
  { label: "Hero banner", href: "/hero", icon: ImageIcon },
];
const SETTINGS_NAV = [{ label: "Store details", href: "/settings", icon: Settings }];

// Set in next.config.ts from APP_ENV (see lib/env.ts).
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV === "prod" ? "prod" : "stage";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : href === "/orders" ? pathname.startsWith("/orders") && !pathname.startsWith("/orders/create") : pathname.startsWith(href);

  const renderLink = (item: { label: string; href: string; icon: any }) => {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} className={`sidebar-item ${isActive(item.href) ? "active" : ""}`} style={{ marginBottom: 2 }}>
        <Icon size={17} strokeWidth={isActive(item.href) ? 2.2 : 1.8} />
        <span>{item.label}</span>
      </Link>
    );
  };

  const sectionLabel = (text: string) => (
    <div style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 500, padding: "16px 10px 6px" }}>{text}</div>
  );

  return (
    <aside
      style={{
        width: 240,
        background: "var(--bg-card)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      <div style={{ padding: "18px 18px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            background: "var(--gradient-gold)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          H
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>Hickoku</div>
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Store admin</div>
        </div>
        <span
          className={`badge ${APP_ENV === "prod" ? "badge-success" : "badge-warning"}`}
          title={APP_ENV === "prod" ? "Live data: orders, site-settings" : "Test data: orders-stage, site-settings-stage"}
        >
          {APP_ENV === "prod" ? "Live" : "Stage"}
        </span>
      </div>

      <nav style={{ padding: "4px 10px", flex: 1, overflowY: "auto" }}>
        {NAV.map(renderLink)}
        <Link
          href="/orders/create"
          className={`sidebar-item ${pathname.startsWith("/orders/create") ? "active" : ""}`}
          style={{ marginBottom: 2, paddingLeft: 37, fontSize: 13 }}
        >
          <Plus size={14} style={{ marginLeft: -21 }} /> Create order
        </Link>
        {sectionLabel("Online store")}
        {CONTENT_NAV.map(renderLink)}
        {sectionLabel("Settings")}
        {SETTINGS_NAV.map(renderLink)}
      </nav>

      <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--bg-hover)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          A
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Admin</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>hickoku.com</div>
        </div>
        <button onClick={handleLogout} className="btn-ghost btn-sm" title="Log out" aria-label="Log out" style={{ padding: 7 }}>
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
