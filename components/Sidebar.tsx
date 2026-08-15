"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  Users,
  ImageIcon,
  Sparkles,
  ChevronRight,
  LogOut,
} from "lucide-react";

const NAV = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Orders", href: "/orders", icon: Package },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Hero Section", href: "/hero", icon: ImageIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside
      style={{
        width: 220,
        minHeight: "100vh",
        background: "var(--bg-card)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "20px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: "var(--gradient-gold)",
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={16} color="#14120a" />
          </div>
          <div>
            <div style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: 14, letterSpacing: "0.01em" }}>
              Hickoku
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
              ADMIN PANEL
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 8px", flex: 1 }}>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 12px 8px",
          }}
        >
          Navigation
        </div>

        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${isActive ? "active" : ""}`}
              style={{ marginBottom: 2 }}
            >
              <Icon size={15} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {isActive && <ChevronRight size={12} style={{ color: "var(--accent-gold)" }} />}
            </Link>
          );
        })}
      </nav>

      {/* Services indicator */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Connected Services
        </div>
        {[
          { name: "AWS DynamoDB", color: "var(--accent-gold)" },
          { name: "Razorpay", color: "var(--accent-blue)" },
          { name: "Delhivery", color: "var(--accent-emerald)" },
        ].map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: s.color,
                boxShadow: `0 0 6px ${s.color}`,
              }}
            />
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.name}</span>
          </div>
        ))}

        <button
          onClick={handleLogout}
          className="btn-ghost"
          style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <LogOut size={13} /> Log out
        </button>
      </div>
    </aside>
  );
}
