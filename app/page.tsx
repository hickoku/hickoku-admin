"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import { getOrderBadge } from "@/components/OrderCard";
import { IndianRupee, Package, Truck, PackageCheck, RefreshCw, ImageIcon } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const PIE_COLORS = ["var(--accent-gold)", "var(--accent-blue)", "var(--accent-emerald)", "var(--accent-rose)", "var(--accent-red)"];

function StatCard({ label, value, sub, icon: Icon, accent, href }: any) {
  const card = (
    <div className="stat-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--font-mono)", marginBottom: 12 }}>
            {label}
          </p>
          <p className="stat-number" style={{ color: "var(--text-primary)", marginBottom: 6 }}>{value}</p>
          {sub && <p style={{ color: "var(--text-muted)", fontSize: 12 }}>{sub}</p>}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${accent}18`, border: `1px solid ${accent}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={18} color={accent} />
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{card}</Link> : card;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load dashboard");
      setStats(data.stats);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  const fmt = (a: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(a);

  const statusData = stats
    ? Object.entries(stats.orders.statusBreakdown).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Trending stats · AWS DynamoDB · Razorpay · Delhivery"
      action={
        <button className="btn-ghost" onClick={loadStats} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Command Overview</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {lastUpdated ? `Last refreshed ${lastUpdated.toLocaleTimeString()}` : "Fetching live data..."}
          </p>
        </div>
      </div>

      {loading && <LoadingState message="Aggregating live data from all services..." />}
      {error && <ErrorState message={error} onRetry={loadStats} />}

      {stats && !loading && (
        <div className="animate-in">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Revenue" value={fmt(stats.revenue.total / 100)} sub={`${stats.orders.paid} paid orders`} icon={IndianRupee} accent="var(--accent-gold)" href="/orders" />
            <StatCard label="Total Orders" value={stats.orders.total} sub="via Razorpay" icon={Package} accent="var(--accent-blue)" href="/orders" />
            <StatCard label="Shipments" value={stats.shipments.total} sub={`${stats.shipments.statusBreakdown["Delivered"] || 0} delivered`} icon={Truck} accent="var(--accent-emerald)" href="/orders" />
            <StatCard label="Hero Section" value="Manage" sub="Homepage banner image" icon={ImageIcon} accent="var(--accent-rose)" href="/hero" />
          </div>

          {/* Charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 16 }}>Revenue — Last 14 Days</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.revenue.trend}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#cba135" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#cba135" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232328" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#605c54" }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#605c54" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1f", border: "1px solid #34343c", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#a5a19a" }}
                    formatter={(v: any) => [fmt(v), "Revenue"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#cba135" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 16 }}>Order Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1a1a1f", border: "1px solid #34343c", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 }}>
                {statusData.map((s: any, i) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {s.name} ({s.value})
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 16 }}>Top Selling Perfumes</h3>
              {stats.topProducts.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No product sales data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232328" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#605c54" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "#a5a19a" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#1a1a1f", border: "1px solid #34343c", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="units" fill="#cba135" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 16 }}>Recent Orders</h3>
              {stats.recentOrders.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No orders yet</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {stats.recentOrders.map((o: any, i: number) => {
                    const id = o.orderId || o.id || o.razorpayOrderId;
                    const name = (o.customerFirstName ? `${o.customerFirstName} ${o.customerLastName || ""}`.trim() : o.customer_name) || "—";
                    return (
                      <div key={id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < stats.recentOrders.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                          <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>{id}</div>
                        </div>
                        {getOrderBadge(o.status)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16, fontFamily: "var(--font-mono)" }}>
            Quick Access
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {[
              { title: "Orders", desc: "DynamoDB orders enriched with Razorpay payment and Delhivery delivery status.", icon: PackageCheck, color: "var(--accent-gold)", href: "/orders", badge: `${stats.orders.total} Orders` },
              { title: "Hero Section", desc: "Upload and manage the homepage hero banner image.", icon: ImageIcon, color: "var(--accent-rose)", href: "/hero", badge: "Manage" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
                  <div className="card" style={{ padding: 20, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${item.color}18`, border: `1px solid ${item.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={18} color={item.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>{item.title}</span>
                          <span className="badge badge-neutral" style={{ fontSize: 10 }}>{item.badge}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{item.desc}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
