"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { RefreshCw, Settings, AlertTriangle, Search } from "lucide-react";
import { imageSrc } from "@/components/products/ImageManager";

type Row = {
  id: string;
  status: "submitted" | "approving" | "approved" | "rejected";
  forWhom: "friend" | "self";
  recipientName: string;
  occasionId: string;
  occasionName: string;
  partyDate: string;
  shipBy: string;
  gift: { name: string; size: string; image: string };
  labelName?: string;
  instagram: string;
  createdAt: string;
  review?: { followers?: number; followsUs?: boolean; dmReceived?: boolean };
  flags: string[];
  blocked?: boolean;
  address: { firstName: string; lastName: string };
};

const TABS = [
  { key: "submitted", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
] as const;

const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}
const statusBadge = (s: Row["status"]) =>
  s === "approved" ? <span className="badge badge-success">Approved</span> : s === "rejected" ? <span className="badge badge-error">Rejected</span> : <span className="badge badge-warning">Pending</span>;

export default function ClubApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ approvedThisWeek: number; weeklyCap: number; minFollowers: number; env: string; table: string } | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("submitted");
  const [occasion, setOccasion] = useState("all");
  const [search, setSearch] = useState("");
  const [flagsOnly, setFlagsOnly] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/club/applications");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load applications");
      setRows(data.applications);
      setMeta({ approvedThisWeek: data.approvedThisWeek, weeklyCap: data.weeklyCap, minFollowers: data.minFollowers, env: data.env, table: data.table });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const statusOf = (r: Row) => (r.status === "approving" ? "submitted" : r.status);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[statusOf(r)] = (c[statusOf(r)] || 0) + 1;
    return c;
  }, [rows]);
  const occasions = useMemo(() => [...new Map(rows.map((r) => [r.occasionId, r.occasionName])).entries()], [rows]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase().replace(/^@/, "");
    return rows
      .filter((r) => tab === "all" || statusOf(r) === tab)
      .filter((r) => occasion === "all" || r.occasionId === occasion)
      .filter((r) => !flagsOnly || r.flags.length > 0)
      .filter((r) => !s || [r.id, r.instagram, r.recipientName, r.address.firstName, r.address.lastName].join(" ").toLowerCase().includes(s))
      .sort((a, b) => (tab === "submitted" ? a.shipBy.localeCompare(b.shipBy) : b.createdAt.localeCompare(a.createdAt)));
  }, [rows, tab, occasion, flagsOnly, search]);

  const pending = rows.filter((r) => statusOf(r) === "submitted");
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shipToday = pending.filter((r) => r.shipBy <= today).length;

  return (
    <AdminLayout
      title="Club applications"
      subtitle="Hickoku Club gift requests. Approve before the ship-by date."
      action={
        <>
          <button className="btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} /> Refresh
          </button>
          <Link href="/club/settings" className="btn-ghost" style={{ textDecoration: "none" }}>
            <Settings size={14} /> Club settings
          </Link>
        </>
      }
    >
      {error && <ErrorState message={error} onRetry={load} />}
      {!error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Pending review", value: pending.length, note: shipToday ? `${shipToday} must ship today` : "None due today", warn: shipToday > 0 },
            {
              label: "Approved this week",
              value: meta ? `${meta.approvedThisWeek} / ${meta.weeklyCap}` : "—",
              note: meta && meta.approvedThisWeek >= meta.weeklyCap ? "Weekly cap reached" : "₹0 orders created",
              warn: !!meta && meta.approvedThisWeek >= meta.weeklyCap,
            },
            { label: "Rejected", value: counts.rejected || 0, note: `${rows.filter((r) => r.blocked).length} blocked` },
          ].map((s) => (
            <div key={s.label} className="stat-card" style={{ padding: "14px 16px" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>{s.label}</p>
              <p className="stat-number" style={{ fontSize: 22 }}>{loading ? "—" : s.value}</p>
              <p style={{ fontSize: 12, marginTop: 4, color: s.warn ? "#b54708" : "var(--text-muted)" }}>{loading ? "" : s.note}</p>
            </div>
          ))}
        </div>
      )}

      {!error && (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                {t.label} <span className="tab-count">{counts[t.key] || 0}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input className="input-field" placeholder="Search handle, name or HC number" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", paddingLeft: 30 }} aria-label="Search applications" />
            </div>
            <select className="input-field" value={occasion} onChange={(e) => setOccasion(e.target.value)} aria-label="Occasion">
              <option value="all">All occasions</option>
              {occasions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={flagsOnly} onChange={(e) => setFlagsOnly(e.target.checked)} /> Flags only
            </label>
          </div>

          {loading ? (
            <LoadingState message="Loading applications…" />
          ) : shown.length === 0 ? (
            <EmptyState message={rows.length ? "No applications match." : "No applications yet."} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Followers</th>
                    <th>Occasion</th>
                    <th>Gift</th>
                    <th>Checks</th>
                    <th>Applied</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const pendingRow = statusOf(r) === "submitted";
                    const late = pendingRow && r.shipBy <= today;
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/club/applications/${r.id}`} style={{ fontWeight: 600, color: "var(--text-primary)", textDecoration: "none" }}>
                            @{r.instagram}
                          </Link>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {r.id} · {`${r.address.firstName} ${r.address.lastName}`.trim()}
                          </div>
                          {r.flags.length > 0 && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                              {r.flags.map((f) => (
                                <span key={f} className={`badge ${f === "Blocked" || f.startsWith("Below") || f.includes("passed") ? "badge-error" : "badge-warning"}`} style={{ textTransform: "none" }}>
                                  <AlertTriangle size={11} /> {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.review?.followers !== undefined ? r.review.followers.toLocaleString("en-IN") : <span style={{ color: "var(--text-muted)" }}>Not checked</span>}</td>
                        <td>
                          <div>
                            {r.occasionName} · {day(r.partyDate)}
                          </div>
                          <div style={{ fontSize: 12, color: late ? "#b42318" : "var(--text-muted)", fontWeight: late ? 600 : 400 }}>{pendingRow ? `Ship by ${day(r.shipBy)}` : r.forWhom === "friend" ? `Surprise for ${r.recipientName}` : "For themselves"}</div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {r.gift.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={imageSrc(r.gift.image)} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} />
                            )}
                            <div>
                              <div>{r.gift.name}</div>
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.labelName ? `Label "${r.labelName}"` : r.forWhom === "friend" ? "Surprise" : "Self"}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <div>{r.review?.followsUs ? "✓ Follows us" : "· Follows us?"}</div>
                          <div style={{ color: "var(--text-muted)" }}>{r.review?.dmReceived ? "✓ DM received" : "· No DM yet"}</div>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{ago(r.createdAt)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                            {statusBadge(statusOf(r) as Row["status"])}
                            <Link href={`/club/applications/${r.id}`} className="btn-ghost" style={{ textDecoration: "none", height: 30, padding: "0 10px" }}>
                              {pendingRow ? "Review" : "View"}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {meta && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
          From <span className="code">{meta.table}</span> ({meta.env}). The week starts Monday (India time).
        </p>
      )}
    </AdminLayout>
  );
}
