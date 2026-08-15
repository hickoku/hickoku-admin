"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { getOrderBadge, getSourceBadge, fmt, fmtDate } from "@/components/OrderCard";
import { Search, RefreshCw, User, Mail, Phone, MapPin, Package, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";

type SortKey = "recent" | "orders" | "spent";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load customers");
      setCustomers(data.customers || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const list = customers.filter((c) => {
      if (!search) return true;
      return (
        c.name?.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s) ||
        c.phone?.includes(s) ||
        c.addresses?.some((a: string) => a.toLowerCase().includes(s))
      );
    });
    return list.sort((a, b) => {
      if (sortKey === "orders") return b.orderCount - a.orderCount;
      if (sortKey === "spent") return b.totalSpent - a.totalSpent;
      return new Date(b.lastOrderAt || 0).getTime() - new Date(a.lastOrderAt || 0).getTime();
    });
  }, [customers, search, sortKey]);

  const repeatCustomers = customers.filter((c) => c.orderCount > 1).length;
  const totalSpentAll = customers.reduce((s, c) => s + c.totalSpent, 0);

  return (
    <AdminLayout title="Customers" subtitle="Distinct customers derived from DynamoDB orders">
      {!loading && !error && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Customers", value: customers.length, color: "var(--accent-blue)" },
            { label: "Repeat Customers", value: repeatCustomers, color: "var(--accent-emerald)" },
            {
              label: "Total Spent",
              value: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(totalSpentAll),
              color: "var(--accent-gold)",
            },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: "12px 18px", flex: 1 }}>
              <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontSize: 18, fontFamily: "var(--font-mono)", fontWeight: 600, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="input-field"
            placeholder="Search name, email, phone, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", paddingLeft: 32 }}
          />
        </div>

        {([
          { value: "recent", label: "Most Recent" },
          { value: "orders", label: "Most Orders" },
          { value: "spent", label: "Highest Spend" },
        ] as { value: SortKey; label: string }[]).map((s) => (
          <button
            key={s.value}
            onClick={() => setSortKey(s.value)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${sortKey === s.value ? "var(--accent-gold)" : "var(--border)"}`,
              background: sortKey === s.value ? "var(--accent-gold-glow)" : "transparent",
              color: sortKey === s.value ? "var(--accent-gold)" : "var(--text-secondary)",
            }}
          >
            <ArrowUpDown size={12} /> {s.label}
          </button>
        ))}

        <button className="btn-ghost" onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {loading && <LoadingState message="Aggregating customers from DynamoDB orders..." />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <div className="animate-in">
          {filtered.length === 0 ? (
            <EmptyState message="No customers found" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((c) => {
                const isExp = expandedId === c.id;
                return (
                  <div key={c.id} className="card" style={{ overflow: "hidden" }}>
                    <div
                      style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                      onClick={() => setExpandedId(isExp ? null : c.id)}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 9,
                          background: "var(--accent-blue-glow)",
                          border: "1px solid rgba(91,155,213,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <User size={16} color="var(--accent-blue)" />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</span>
                          {c.sources.filter((s: string) => s !== "storefront").map((s: string) => (
                            <span key={s}>{getSourceBadge(s)}</span>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 12 }}>
                          {c.phone && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} /> {c.phone}</span>}
                          {c.email && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Mail size={10} /> {c.email}</span>}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{fmt(c.totalSpent)}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            {c.orderCount} order{c.orderCount !== 1 ? "s" : ""}
                            {c.cancelledCount > 0 && ` (${c.cancelledCount} cancelled)`}
                          </div>
                        </div>
                        {isExp ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
                      </div>
                    </div>

                    {isExp && (
                      <div style={{ borderTop: "1px solid var(--border)", padding: 18 }} className="animate-in">
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
                          <div className="card-elevated" style={{ padding: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                              <MapPin size={14} color="var(--accent-emerald)" />
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                                Address{c.addresses.length !== 1 ? "es" : ""} ({c.addresses.length})
                              </span>
                            </div>
                            {c.addresses.length === 0 ? (
                              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No address on file</p>
                            ) : (
                              c.addresses.map((a: string, i: number) => (
                                <p key={i} style={{ fontSize: 12, color: "var(--text-primary)", padding: "6px 0", borderBottom: i < c.addresses.length - 1 ? "1px solid var(--border)" : "none" }}>
                                  {a}
                                </p>
                              ))
                            )}
                          </div>

                          <div className="card-elevated" style={{ padding: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                              <User size={14} color="var(--accent-blue)" />
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Summary</span>
                            </div>
                            {[
                              ["First Order", fmtDate(c.firstOrderAt)],
                              ["Last Order", fmtDate(c.lastOrderAt)],
                              ["Sources", c.sources.map((s: string) => (s === "storefront" ? "Storefront" : s)).join(", ")],
                            ].map(([k, v]) => (
                              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                                <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{k}</span>
                                <span className="mono" style={{ fontSize: 12 }}>{v}</span>
                              </div>
                            ))}
                          </div>

                          <div className="card-elevated" style={{ padding: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                              <Package size={14} color="var(--accent-gold)" />
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Orders ({c.orders.length})</span>
                            </div>
                            {c.orders.map((o: any) => (
                              <Link
                                key={o.orderId}
                                href={`/orders?search=${encodeURIComponent(o.orderId)}`}
                                style={{ textDecoration: "none", display: "block" }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="mono" style={{ fontSize: 11, color: "var(--accent-blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {o.orderId}
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{fmtDate(o.createdAt)}</div>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span className="mono" style={{ fontSize: 11 }}>{fmt(o.total || 0)}</span>
                                    {getOrderBadge(o.status)}
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
