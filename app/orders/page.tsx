"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import OrderCard, { getOrderAmountRupees } from "@/components/OrderCard";
import { RefreshCw, Search, ArrowDown, ArrowUp, Plus } from "lucide-react";

const SOURCES = [
  { value: "all", label: "All" },
  { value: "storefront", label: "Storefront" },
  { value: "amazon", label: "Amazon" },
  { value: "influencer", label: "Influencer" },
  { value: "other", label: "Other" },
];

function OrdersPageInner() {
  const searchParams = useSearchParams();
  const [dbOrders, setDbOrders] = useState<any[]>([]);
  const [razorOrders, setRazorOrders] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [dbRes, razorRes] = await Promise.allSettled([
        fetch("/api/orders?limit=500"),
        fetch("/api/razorpay?type=orders"),
      ]);

      let orders: any[] = [];
      if (dbRes.status === "fulfilled" && dbRes.value.ok) orders = (await dbRes.value.json()).orders || [];
      if (razorRes.status === "fulfilled" && razorRes.value.ok) setRazorOrders((await razorRes.value.json()).orders || []);
      setDbOrders(orders);

      // Delhivery's tracking API can't list "all shipments" — it only accepts
      // known waybills/refs. Collect the AWBs already stored on orders and
      // batch-fetch just those in one call.
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

  async function handleCancel(order: any, force = false) {
    const id = order.orderId || order.id;
    if (!id) return;
    if (!force && !confirm(`Cancel order ${id}? If it has a Delhivery shipment, this will also cancel that pickup. The order stays in the panel marked as cancelled.`)) return;
    setCancellingId(id);
    try {
      const res = await fetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, force }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.delhiveryCancelFailed && confirm(`${data.error}\n\nMark it cancelled in the admin panel anyway? (The Delhivery shipment will remain active.)`)) {
          return handleCancel(order, true);
        }
        throw new Error(data.error || "Failed to cancel order");
      }
      setDbOrders((prev) => prev.map((o) => ((o.orderId || o.id) === id ? { ...o, status: "cancelled" } : o)));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCancellingId(null);
    }
  }

  const getShip = (order: any) => (order.awb ? shipments.find((s) => s.waybill === order.awb) : undefined);
  const getRazorOrder = (dbOrder: any) => razorOrders.find((r) => r.id === dbOrder.razorpayOrderId);

  const mergedOrders = dbOrders.map((dbOrder) => ({ ...dbOrder, razorpay_data: getRazorOrder(dbOrder) || null }));

  const filtered = mergedOrders
    .filter((o) => {
      const orderStatus = (o.status || "").toLowerCase();
      const matchStatus = statusFilter === "all" || orderStatus === statusFilter.toLowerCase();
      const orderSource = o.source || "storefront";
      const matchSource = sourceFilter === "all" || orderSource === sourceFilter;
      const s = search.toLowerCase();
      const fullName = [o.customerFirstName, o.customerLastName, o.customer_name, o.name].filter(Boolean).join(" ").toLowerCase();
      const email = (o.customerEmail || o.email || "").toLowerCase();
      const phone = o.customerPhone || o.phone || "";
      const matchSearch =
        !search ||
        o.orderId?.toLowerCase().includes(s) ||
        o.id?.toLowerCase().includes(s) ||
        o.orderNumber?.toLowerCase().includes(s) ||
        o.razorpayOrderId?.toLowerCase().includes(s) ||
        fullName.includes(s) ||
        email.includes(s) ||
        phone.includes(search);
      return matchStatus && matchSource && matchSearch;
    })
    .sort((a, b) => {
      const toMs = (v: any) => (v ? new Date(v).getTime() : 0);
      const timeA = toMs(a.createdAt || a.created_at);
      const timeB = toMs(b.createdAt || b.created_at);
      return sortDir === "desc" ? timeB - timeA : timeA - timeB;
    });

  const paidCount = mergedOrders.filter((o) => ["paid", "completed", "confirmed"].includes((o.status || "").toLowerCase())).length;
  const totalRevenue = mergedOrders.reduce((s, o) => s + getOrderAmountRupees(o), 0);

  return (
    <AdminLayout
      title="Orders"
      subtitle="DynamoDB orders · payment info from Razorpay · delivery info from Delhivery"
      action={
        <Link href="/orders/create" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <Plus size={14} /> Create Order
        </Link>
      }
    >
      {!loading && !error && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Orders", value: mergedOrders.length, color: "var(--accent-blue)" },
            { label: "Paid / Completed", value: paidCount, color: "var(--accent-emerald)" },
            {
              label: "Revenue",
              value: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(totalRevenue),
              color: "var(--accent-gold)",
            },
            { label: "Shipments Tracked", value: shipments.length, color: "var(--accent-rose)" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: "12px 18px", flex: 1 }}>
              <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontSize: 18, fontFamily: "var(--font-mono)", fontWeight: 600, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="input-field"
            placeholder="Search order ID, customer, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", paddingLeft: 32 }}
          />
        </div>

        {["all", "paid", "pending", "cancelled", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              textTransform: "capitalize",
              border: `1px solid ${statusFilter === s ? "var(--accent-gold)" : "var(--border)"}`,
              background: statusFilter === s ? "var(--accent-gold-glow)" : "transparent",
              color: statusFilter === s ? "var(--accent-gold)" : "var(--text-secondary)",
            }}
          >
            {s}
          </button>
        ))}

        <button
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          className="btn-ghost"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          {sortDir === "desc" ? <ArrowDown size={13} /> : <ArrowUp size={13} />} {sortDir === "desc" ? "Newest First" : "Oldest First"}
        </button>

        <button className="btn-ghost" onClick={loadAll} style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Source
        </span>
        {SOURCES.map((s) => (
          <button
            key={s.value}
            onClick={() => setSourceFilter(s.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              border: `1px solid ${sourceFilter === s.value ? "var(--accent-blue)" : "var(--border)"}`,
              background: sourceFilter === s.value ? "var(--accent-blue-glow)" : "transparent",
              color: sourceFilter === s.value ? "var(--accent-blue)" : "var(--text-secondary)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <LoadingState message="Loading orders from DynamoDB, Razorpay & Delhivery..." />}
      {error && <ErrorState message={error} onRetry={loadAll} />}

      {!loading && !error && (
        <div className="animate-in">
          {filtered.length === 0 ? (
            <EmptyState message="No orders found" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((order, idx) => {
                const ordId = order.orderId || order.id || order.order_id || order.razorpayOrderId;
                const ship = getShip(order);
                const isExp = expandedId === ordId;
                return (
                  <OrderCard
                    key={ordId || `order-${idx}`}
                    order={order}
                    ship={ship}
                    isExp={isExp}
                    onToggleExpand={() => setExpandedId(isExp ? null : ordId)}
                    onCancel={order.manuallyCreated && order.status !== "cancelled" ? () => handleCancel(order) : undefined}
                    cancelling={cancellingId === ordId}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
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
