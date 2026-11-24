"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Switch } from "@/components/FormBits";
import { fmtIst, type OfferProduct } from "@/components/offers/OfferForm";
import { isLive, priceCart, priceProduct, type Offer, type OfferLevel } from "@/lib/offerEngine";
import { describe, needsStoreUpdate, typeLabel } from "@/lib/offerText";
import { Plus, RefreshCw, TicketPercent, Radio, Clock } from "lucide-react";

type Data = { offers: Offer[]; products: OfferProduct[]; env: string; table: string; typesLive: boolean };

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

function statusOf(o: Offer, now: Date) {
  if (!o.enabled) return { label: "Off", cls: "badge-neutral" };
  if (isLive(o, now)) return { label: "Live", cls: "badge-success" };
  if (o.usageLimit && (o.usedCount || 0) >= o.usageLimit) return { label: "Used up", cls: "badge-neutral" };
  if (o.endsAt && new Date(o.endsAt) <= now) return { label: "Ended", cls: "badge-neutral" };
  return { label: "Scheduled", cls: "badge-info" };
}

function OffersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast, showToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Offer | null>(null);
  const [now] = useState(() => new Date());

  async function fetchOffers(): Promise<Data> {
    const d = await (await fetch("/api/offers")).json();
    if (!d.success) throw new Error(d.error || "Failed to load offers");
    return d;
  }
  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchOffers());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    fetchOffers()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    const deleted = params.get("deleted");
    if (deleted) {
      showToast(`Deleted ${deleted}`);
      router.replace("/offers");
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isProd = data?.env === "prod";

  async function toggle(o: Offer) {
    setPendingToggle(null);
    setBusyId(o.id);
    try {
      const d = await (await fetch(`/api/offers/${encodeURIComponent(o.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !o.enabled }) })).json();
      if (!d.success) throw new Error(d.error);
      setData((prev) => prev && { ...prev, offers: prev.offers.map((x) => (x.id === o.id ? d.offer : x)) });
      showToast(`${o.name} turned ${d.offer.enabled ? "on" : "off"}`);
    } catch (e: any) {
      showToast(e.message || "Couldn't update", true);
    } finally {
      setBusyId(null);
    }
  }

  // What a shopper pays right now with the live offers, for a sample product.
  const summary = useMemo(() => {
    if (!data || !data.products.length) return null;
    const live = data.offers.filter((o) => isLive(o, now));
    const p = data.products[0];
    const unit = priceProduct(p.price, p.id, live, now);
    const carts = [1, 2, 3].map((q) => ({ q, ...priceCart([{ productId: p.id, price: unit.price, quantity: q }], live, now) }));
    return { p, unit, carts, live };
  }, [data, now]);

  const sections: { key: string; levels: OfferLevel[]; title: string; sub: string }[] = [
    { key: "product", levels: ["product"], title: "Product price offers", sub: "Change the price shown on products. Run first, lowest order number first." },
    { key: "order", levels: ["bxgy", "cart"], title: "Order offers", sub: "Taken off at checkout, after product offers: Buy X get Y first, then amount off the order." },
    { key: "extras", levels: ["gift", "shipping"], title: "Free gifts & free delivery", sub: "Added at checkout when the cart qualifies. Always combine with other offers." },
  ];

  return (
    <AdminLayout
      title="Offers & discounts"
      subtitle={data ? `${isProd ? "Live" : "Stage"} · ${data.table}` : undefined}
      action={
        <>
          <button className="btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <Link href="/offers/new" className="btn-primary" style={{ textDecoration: "none" }}>
            <Plus size={15} /> New offer
          </Link>
        </>
      }
    >
      {isProd && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "#fffaeb", border: "1px solid #fedf89", color: "#b54708", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          <Radio size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>These are the live store&apos;s offers. Changes reach hickoku.com within about a minute.</span>
        </div>
      )}
      {data && !data.typesLive && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          <Clock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            New offer types (Buy X get Y, free gift, free delivery, discount codes, limits) can be set up now. They can be switched on once the storefront
            update is live.
          </span>
        </div>
      )}
      {loading && !data && <LoadingState message="Loading offers…" />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 16, alignItems: "start" }}>
          <div>
            {sections.map((sec) => {
              const list = data.offers.filter((o) => sec.levels.includes(o.level)).sort((a, b) => a.sequence - b.sequence);
              return (
                <div key={sec.key} className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
                  <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600 }}>{sec.title}</h2>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{sec.sub}</p>
                  </div>
                  {list.length === 0 ? (
                    <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nothing here yet.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 52 }}>Order</th>
                          <th>Offer</th>
                          <th>Discount</th>
                          <th>Schedule (IST)</th>
                          <th>Status</th>
                          <th style={{ width: 60, textAlign: "right" }}>On</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((o) => {
                          const st = statusOf(o, now);
                          const d = describe(o, data.products);
                          return (
                            <tr key={o.id} onClick={() => router.push(`/offers/${encodeURIComponent(o.id)}`)} style={{ cursor: "pointer" }}>
                              <td className="mono" style={{ color: "var(--text-muted)" }}>{o.sequence}</td>
                              <td>
                                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 600 }}>{o.name}</span>
                                  {o.couponCode && <span className="badge badge-neutral mono">{o.couponCode}</span>}
                                  {!data.typesLive && needsStoreUpdate(o) && (
                                    <span className="badge badge-warning" title="Can be switched on after the storefront update">
                                      <Clock size={11} /> Waits for store update
                                    </span>
                                  )}
                                </div>
                                {sec.key !== "product" && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{typeLabel(o.level)}</div>}
                                <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 260 }}>{o.title || o.message || "—"}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 500 }}>{d.amount}</div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                  {d.who}
                                  {d.cond ? ` · ${d.cond}` : ""}
                                  {!o.combinable ? " · exclusive" : ""}
                                  {o.usageLimit || o.usedCount ? ` · used ${o.usedCount || 0}${o.usageLimit ? ` / ${o.usageLimit}` : ""}` : ""}
                                </div>
                              </td>
                              <td style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                {o.startsAt || o.endsAt ? (
                                  <>
                                    <div>{o.startsAt ? fmtIst(o.startsAt) : "Now"}</div>
                                    <div style={{ color: "var(--text-muted)" }}>→ {o.endsAt ? fmtIst(o.endsAt) : "no end"}</div>
                                  </>
                                ) : (
                                  <span style={{ color: "var(--text-muted)" }}>Always</span>
                                )}
                              </td>
                              <td>
                                <span className={`badge ${st.cls}`}>{st.label}</span>
                              </td>
                              <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                                <Switch id={`on-${o.id}`} checked={o.enabled} disabled={busyId === o.id || (!o.enabled && !data.typesLive && needsStoreUpdate(o))} onChange={() => (isProd ? setPendingToggle(o) : toggle(o))} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card" style={{ padding: 18, position: "sticky", top: 24 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <TicketPercent size={16} style={{ color: "var(--text-muted)" }} />
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>What customers pay now</h3>
            </div>
            {!summary ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No products to preview.</p>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                  {summary.p.name}, list price {inr(summary.p.price)}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>Product price</span>
                  <span style={{ fontWeight: 600 }}>
                    {summary.unit.savings > 0 && <s style={{ color: "var(--text-muted)", fontWeight: 400, marginRight: 6 }}>{inr(summary.p.price)}</s>}
                    {inr(summary.unit.price)}
                  </span>
                </div>
                {summary.carts.map((c) => (
                  <div key={c.q} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Cart of {c.q}</span>
                      <span style={{ fontWeight: 600 }}>{inr(c.total)}</span>
                    </div>
                    {c.applied.length > 0 && <div style={{ fontSize: 12, color: "var(--accent-emerald)" }}>{c.applied.map((a) => `${a.name} −${inr(a.amount)}`).join(", ")}</div>}
                  </div>
                ))}
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
                  {summary.live.length ? `Live: ${summary.live.map((o) => o.name).join(", ")}` : "No offers are live."}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingToggle}
        title={pendingToggle ? `Turn ${pendingToggle.enabled ? "off" : "on"} ${pendingToggle.name}?` : ""}
        confirmLabel={pendingToggle?.enabled ? "Turn off" : "Turn on"}
        tone={pendingToggle?.enabled ? "danger" : "primary"}
        onConfirm={() => pendingToggle && toggle(pendingToggle)}
        onClose={() => setPendingToggle(null)}
      >
        This changes prices on the live store within about a minute.
      </ConfirmDialog>
      {toast}
    </AdminLayout>
  );
}

export default function OffersPage() {
  return (
    <Suspense fallback={null}>
      <OffersInner />
    </Suspense>
  );
}
