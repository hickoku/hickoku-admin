"use client";

import { useEffect, useMemo, useState, Suspense, Fragment } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { LoadingState, ErrorState } from "@/components/States";
import {
  OrderDetails,
  SOURCE_LABELS,
  fmt,
  fmtShortDate,
  getOrderAmountRupees,
  getOrderBadge,
  getOrderId,
  getPaymentBadge,
  getShipBadge,
  getCustomerName,
} from "@/components/OrderCard";
import { deleteOrders, deleteWarnings } from "@/lib/deleteOrderClient";
import { RefreshCw, Search, Plus, Trash2, ChevronRight, ChevronLeft, X, Package } from "lucide-react";
import { readJson } from "@/lib/readJson";

const STATUS_TABS = ["all", "pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "failed"];
const PAGE_SIZE = 25;

type Dialog =
  | { kind: "delete"; orders: any[] }
  | { kind: "cancel"; order: any }
  | { kind: "cancelForce"; order: any; reason: string }
  | null;

function OrdersPageInner() {
  const searchParams = useSearchParams();
  const { toast, showToast } = useToast();
  const [dbOrders, setDbOrders] = useState<any[]>([]);
  const [razorOrders, setRazorOrders] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [dbRes, razorRes] = await Promise.allSettled([fetch("/api/orders?limit=500"), fetch("/api/razorpay?type=orders")]);

      let orders: any[] = [];
      if (dbRes.status === "fulfilled" && dbRes.value.ok) orders = (await dbRes.value.json()).orders || [];
      else throw new Error("Couldn't load orders from DynamoDB");
      if (razorRes.status === "fulfilled" && razorRes.value.ok) setRazorOrders((await razorRes.value.json()).orders || []);
      setDbOrders(orders);
      setSelected(new Set());

      // Delhivery's tracking API can't list "all shipments" — it only accepts
      // known waybills. Collect the AWBs stored on orders and batch-fetch them.
      const awbs = [...new Set(orders.map((o) => o.awb).filter(Boolean))];
      if (awbs.length) {
        const shipRes = await fetch(`/api/delhivery?waybills=${encodeURIComponent(awbs.join(","))}`);
        if (shipRes.ok) setShipments((await shipRes.json()).shipments || []);
      } else {
        setShipments([]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // ---- cancel -------------------------------------------------------------
  async function runCancel(order: any, force: boolean) {
    const id = order.orderId;
    setCancellingId(id);
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, force }),
      });
      const data = await readJson(res);
      if (!data.success) {
        if (data.delhiveryCancelFailed && !force) {
          setDialog({ kind: "cancelForce", order, reason: data.error });
          return;
        }
        throw new Error(data.error || "Failed to cancel order");
      }
      setDbOrders((prev) => prev.map((o) => (o.orderId === id ? { ...o, status: "cancelled" } : o)));
      setDialog(null);
      showToast(`Order ${order.orderNumber || id} cancelled`);
    } catch (e: any) {
      setDialog(null);
      showToast(e.message, true);
    } finally {
      setBusy(false);
      setCancellingId(null);
    }
  }

  // ---- delete -------------------------------------------------------------
  async function runDelete(orders: any[]) {
    setBusy(true);
    try {
      const { deleted, failed } = await deleteOrders(orders.map((o) => o.orderId));
      const gone = new Set(deleted);
      setDbOrders((prev) => prev.filter((o) => !gone.has(o.orderId)));
      setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
      if (expandedId && gone.has(expandedId)) setExpandedId(null);
      if (failed.length) showToast(`Deleted ${deleted.length}, failed ${failed.length}: ${failed[0].error}`, true);
      else showToast(`Deleted ${deleted.length} order${deleted.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  // ---- derived data -------------------------------------------------------
  const shipByAwb = useMemo(() => new Map(shipments.map((s) => [s.waybill, s])), [shipments]);
  const razorById = useMemo(() => new Map(razorOrders.map((r) => [r.id, r])), [razorOrders]);
  const mergedOrders = useMemo(
    () => dbOrders.map((o) => ({ ...o, razorpay_data: razorById.get(o.razorpayOrderId) || null })),
    [dbOrders, razorById],
  );

  const sourceAndSearch = useMemo(() => {
    const s = search.trim().toLowerCase();
    return mergedOrders.filter((o) => {
      const matchSource = sourceFilter === "all" || (o.source || "storefront") === sourceFilter;
      if (!matchSource) return false;
      if (!s) return true;
      const hay = [o.orderId, o.id, o.orderNumber, o.razorpayOrderId, o.awb, getCustomerName(o), o.customerEmail || o.email, o.customerPhone || o.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [mergedOrders, search, sourceFilter]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: sourceAndSearch.length };
    for (const o of sourceAndSearch) {
      const st = (o.status || "").toLowerCase();
      c[st] = (c[st] || 0) + 1;
    }
    return c;
  }, [sourceAndSearch]);

  const filtered = useMemo(() => {
    const toMs = (v: any) => (v ? new Date(v).getTime() : 0);
    return sourceAndSearch
      .filter((o) => statusFilter === "all" || (o.status || "").toLowerCase() === statusFilter)
      .sort((a, b) => {
        const d = toMs(a.createdAt || a.created_at) - toMs(b.createdAt || b.created_at);
        return sortDir === "desc" ? -d : d;
      });
  }, [sourceAndSearch, statusFilter, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const selectable = pageRows.filter((o) => o.orderId);
  const allOnPageSelected = selectable.length > 0 && selectable.every((o) => selected.has(o.orderId));
  const someOnPageSelected = selectable.some((o) => selected.has(o.orderId));
  const selectedOrders = mergedOrders.filter((o) => selected.has(o.orderId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) selectable.forEach((o) => next.delete(o.orderId));
      else selectable.forEach((o) => next.add(o.orderId));
      return next;
    });
  }
  function selectAllFiltered() {
    setSelected(new Set(filtered.map((o) => o.orderId).filter(Boolean)));
  }

  function changeFilter(fn: () => void) {
    fn();
    setPage(0);
  }

  const paidCount = mergedOrders.filter((o) => (o.paymentStatus || "").toLowerCase() === "paid").length;
  const revenue = mergedOrders
    .filter((o) => (o.paymentStatus || "").toLowerCase() === "paid" && o.status !== "cancelled")
    .reduce((s, o) => s + getOrderAmountRupees(o), 0);
  const toShip = mergedOrders.filter((o) => ["confirmed", "processing"].includes((o.status || "").toLowerCase()) && !o.awb).length;

  const delWarn = dialog?.kind === "delete" ? deleteWarnings(dialog.orders) : null;
  const delCount = dialog?.kind === "delete" ? dialog.orders.length : 0;

  return (
    <AdminLayout
      title="Orders"
      subtitle="Orders from the online store, Amazon and manual sends"
      action={
        <>
          <button className="btn-ghost" onClick={loadAll} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} /> Refresh
          </button>
          <Link href="/orders/create" className="btn-primary" style={{ textDecoration: "none" }}>
            <Plus size={15} /> Create order
          </Link>
        </>
      }
    >
      {!error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total orders", value: mergedOrders.length.toLocaleString("en-IN") },
            { label: "Paid orders", value: paidCount.toLocaleString("en-IN") },
            { label: "Revenue (paid, not cancelled)", value: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(revenue) },
            { label: "Awaiting shipment", value: toShip.toLocaleString("en-IN") },
          ].map((s) => (
            <div key={s.label} className="stat-card" style={{ padding: "14px 16px" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>{s.label}</p>
              <p className="stat-number" style={{ fontSize: 22 }}>{loading ? "—" : s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="tabs" role="tablist">
          {STATUS_TABS.filter((t) => t === "all" || statusCounts[t] || statusFilter === t).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={statusFilter === t}
              className={`tab ${statusFilter === t ? "active" : ""}`}
              onClick={() => changeFilter(() => setStatusFilter(t))}
            >
              <span style={{ textTransform: "capitalize" }}>{t}</span>
              {!loading && <span className="tab-count">{statusCounts[t] || 0}</span>}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, padding: 12, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="input-field"
              placeholder="Search by order, customer, email, phone or AWB"
              value={search}
              onChange={(e) => changeFilter(() => setSearch(e.target.value))}
              style={{ width: "100%", paddingLeft: 34, paddingRight: search ? 32 : 12 }}
            />
            {search && (
              <button
                aria-label="Clear search"
                onClick={() => changeFilter(() => setSearch(""))}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <select className="input-field" value={sourceFilter} onChange={(e) => changeFilter(() => setSourceFilter(e.target.value))} aria-label="Channel">
            <option value="all">All channels</option>
            {Object.entries(SOURCE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className="input-field" value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")} aria-label="Sort">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="bulk-bar">
            <span style={{ fontWeight: 600 }}>{selected.size} selected</span>
            {selected.size < filtered.length && allOnPageSelected && (
              <button className="btn-ghost btn-sm" onClick={selectAllFiltered} style={{ boxShadow: "none" }}>
                Select all {filtered.length} matching orders
              </button>
            )}
            <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ boxShadow: "none" }}>
              Clear selection
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn-danger btn-sm" onClick={() => setDialog({ kind: "delete", orders: selectedOrders })}>
              <Trash2 size={14} /> Delete {selected.size}
            </button>
          </div>
        )}

        {loading && <LoadingState message="Loading orders…" />}
        {error && <ErrorState message={error} onRetry={loadAll} />}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40, paddingRight: 0 }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label="Select all on this page"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                      }}
                      onChange={togglePage}
                    />
                  </th>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th>Items</th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: "56px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                      <Package size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                      <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>No orders found</div>
                      <div style={{ fontSize: 13 }}>Try changing the filters or search.</div>
                    </td>
                  </tr>
                )}
                {pageRows.map((order, idx) => {
                  const ordId = getOrderId(order);
                  const ship = order.awb ? shipByAwb.get(order.awb) : undefined;
                  const isExp = expandedId === ordId;
                  const isSel = !!order.orderId && selected.has(order.orderId);
                  const itemCount = (order.products || []).reduce((s: number, p: any) => s + Number(p.quantity || 1), 0);
                  return (
                    <Fragment key={ordId || `order-${idx}`}>
                      <tr
                        onClick={() => setExpandedId(isExp ? null : ordId)}
                        style={{ cursor: "pointer", background: isSel ? "#f5f8ff" : isExp ? "var(--bg-hover)" : undefined }}
                        aria-expanded={isExp}
                      >
                        <td style={{ paddingRight: 0 }} onClick={(e) => e.stopPropagation()}>
                          {order.orderId && (
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={isSel}
                              onChange={() => toggle(order.orderId)}
                              aria-label={`Select order ${order.orderNumber || ordId}`}
                            />
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 600 }}>{order.orderNumber || ordId}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{SOURCE_LABELS[order.source] || "Online store"}</div>
                        </td>
                        <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtShortDate(order.createdAt || order.created_at)}</td>
                        <td style={{ maxWidth: 180 }}>
                          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getCustomerName(order)}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {order.customerEmail || order.customerPhone || ""}
                          </div>
                        </td>
                        <td className="mono" style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(getOrderAmountRupees(order))}</td>
                        <td>{getPaymentBadge(order)}</td>
                        <td>{getOrderBadge(order.status || order.razorpay_data?.status)}</td>
                        <td>{getShipBadge(ship?.status, !!order.awb)}</td>
                        <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "—"}</td>
                        <td style={{ color: "var(--text-muted)" }}>
                          <ChevronRight size={16} style={{ transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                        </td>
                      </tr>
                      {isExp && (
                        <tr style={{ background: "var(--bg-elevated)" }}>
                          <td colSpan={10} style={{ padding: 0 }}>
                            <OrderDetails
                              order={order}
                              ship={ship}
                              onCancel={order.manuallyCreated && order.status !== "cancelled" ? () => setDialog({ kind: "cancel", order }) : undefined}
                              cancelling={cancellingId === order.orderId}
                              onDelete={order.orderId ? () => setDialog({ kind: "delete", orders: [order] }) : undefined}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderTop: "1px solid var(--border)",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            <span>
              Showing {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length}
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button className="btn-ghost btn-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                <ChevronLeft size={14} />
              </button>
              <span style={{ minWidth: 80, textAlign: "center" }}>
                Page {safePage + 1} of {pageCount}
              </span>
              <button className="btn-ghost btn-sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={delCount > 1 ? `Delete ${delCount} orders?` : "Delete this order?"}
        confirmLabel={delCount > 1 ? `Delete ${delCount} orders` : "Delete order"}
        busyLabel="Deleting…"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.kind === "delete" && runDelete(dialog.orders)}
      >
        {dialog?.kind === "delete" && delWarn && (
          <>
            <p>
              {dialog.orders
                .slice(0, 4)
                .map((o) => o.orderNumber || o.orderId)
                .join(", ")}
              {delCount > 4 && ` and ${delCount - 4} more`} will be permanently removed. This can&apos;t be undone.
            </p>
            {(delWarn.storefront > 0 || delWarn.activeShipments > 0) && (
              <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 13, color: "#b54708" }}>
                {delWarn.storefront > 0 && (
                  <li>
                    {delCount === 1
                      ? "This is an online store order"
                      : delWarn.storefront === 1
                        ? "1 of these is an online store order"
                        : `${delWarn.storefront} of these are online store orders`}
                    . Only delete test orders.
                  </li>
                )}
                {delWarn.activeShipments > 0 && (
                  <li>
                    {delCount === 1 ? "It has" : `${delWarn.activeShipments} have`} an active Delhivery shipment. Deleting doesn&apos;t cancel the pickup.
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "cancel"}
        title="Cancel this order?"
        confirmLabel="Cancel order"
        busyLabel="Cancelling…"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.kind === "cancel" && runCancel(dialog.order, false)}
      >
        {dialog?.kind === "cancel" && (
          <p>
            Order {dialog.order.orderNumber || dialog.order.orderId} will be marked cancelled
            {dialog.order.awb ? " and its Delhivery pickup cancelled" : ""}. It stays in the list.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "cancelForce"}
        title="Delhivery couldn't cancel the shipment"
        confirmLabel="Mark cancelled anyway"
        busyLabel="Saving…"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.kind === "cancelForce" && runCancel(dialog.order, true)}
      >
        {dialog?.kind === "cancelForce" && <p>{dialog.reason} You can still mark the order cancelled here, but the shipment stays active at Delhivery.</p>}
      </ConfirmDialog>

      {toast}
    </AdminLayout>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  );
}
