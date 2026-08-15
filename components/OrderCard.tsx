"use client";

import { Package, User, CreditCard, Truck, ShoppingBag, ChevronUp, ChevronDown, Ban, Loader2, FileText } from "lucide-react";

const SOURCE_LABELS: Record<string, string> = {
  amazon: "Amazon",
  influencer: "Influencer",
  other: "Other",
};

export function getSourceBadge(source?: string) {
  if (!source || source === "storefront") return null;
  return <span className="badge badge-rose">{SOURCE_LABELS[source] || source}</span>;
}

export function getOrderBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
    case "completed":
      return <span className="badge badge-success">{status}</span>;
    case "pending":
      return <span className="badge badge-warning">Pending</span>;
    case "created":
      return <span className="badge badge-info">Created</span>;
    case "cancelled":
    case "failed":
      return <span className="badge badge-error">{status}</span>;
    default:
      return <span className="badge badge-neutral">{status || "—"}</span>;
  }
}

export function getShipBadge(status?: string) {
  if (!status) return <span className="badge badge-neutral">No Shipment</span>;
  const s = status.toLowerCase();
  if (s.includes("delivered")) return <span className="badge badge-success">Delivered</span>;
  if (s.includes("transit") || s.includes("dispatch")) return <span className="badge badge-info">In Transit</span>;
  if (s.includes("pending") || s.includes("pickup")) return <span className="badge badge-warning">Pending Pickup</span>;
  if (s.includes("cancel") || s.includes("rto")) return <span className="badge badge-error">Cancelled / RTO</span>;
  return <span className="badge badge-neutral">{status}</span>;
}

export function fmt(a: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(a);
}

export function fmtDate(ts: any) {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// DynamoDB orders store `total` (and item `price`) as plain rupees (e.g. 898),
// while Razorpay always reports amounts in paise (e.g. 89800). Prefer the
// DynamoDB rupee total when present; only fall back to paise-based Razorpay
// fields — and divide by 100 — when it isn't.
export function getOrderAmountRupees(order: any): number {
  if (typeof order.total === "number") return order.total;
  const paise = order.total_amount || order.razorpay_data?.amount_paid || order.amount_paid || order.amount || 0;
  return paise / 100;
}

function DetailBlock({ title, icon, color, rows }: { title: string; icon: React.ReactNode; color: string; rows: [string, any][] }) {
  return (
    <div className="card-elevated" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{title}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{k}</span>
          <span className="mono" style={{ fontSize: 12, maxWidth: 180, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
            {String(v ?? "—")}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function OrderCard({
  order,
  ship,
  isExp,
  onToggleExpand,
  onCancel,
  cancelling,
}: {
  order: any;
  ship: any;
  isExp: boolean;
  onToggleExpand: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const ordId = order.orderId || order.id || order.order_id || order.razorpayOrderId;
  const custNm =
    (order.customerFirstName ? `${order.customerFirstName} ${order.customerLastName || ""}`.trim() : order.customer_name || order.name) || "—";
  const custEm = order.customerEmail || order.email || "";
  const custPhone = order.customerPhone || order.phone || "";
  const custCity = order.shippingAddress?.city || order.city || "";
  const custState = order.shippingAddress?.state || order.state || "";
  const custAddr = order.shippingAddress?.street || order.address || "";
  const rz = order.razorpay_data;
  const payments = rz?.payments?.items || [];

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={onToggleExpand}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: "var(--accent-gold-glow)",
            border: "1px solid rgba(203,161,53,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Package size={16} color="var(--accent-gold)" />
        </div>

        <div style={{ minWidth: 0, width: 210, flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            {ordId}
          </span>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
            {fmtDate(order.createdAt || order.created_at)}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <User size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {custNm}
            </span>
          </div>
          {custEm && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{custEm}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
            {fmt(getOrderAmountRupees(order))}
          </span>
          {getSourceBadge(order.source)}
          {getOrderBadge(order.status || rz?.status)}
          {getShipBadge(ship?.status)}
          {isExp ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
        </div>
      </div>

      {isExp && (
        <div style={{ borderTop: "1px solid var(--border)", padding: 18 }} className="animate-in">
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 14 }}>
            <button
              className="btn-ghost"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`/api/invoice?orderId=${encodeURIComponent(ordId)}`, "_blank", "noopener");
              }}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
            >
              <FileText size={13} /> Invoice
            </button>
            {onCancel && (
              <button
                className="btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                disabled={cancelling}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
              >
                {cancelling ? <Loader2 size={13} style={{ animation: "spin 0.6s linear infinite" }} /> : <Ban size={13} />}
                {cancelling ? "Cancelling..." : "Cancel Order"}
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            <DetailBlock
              title="Order Details"
              icon={<Package size={14} color="var(--accent-gold)" />}
              color="var(--accent-gold)"
              rows={[
                ["Order ID", ordId],
                ["Source", SOURCE_LABELS[order.source] || "Storefront"],
                ["Razorpay Order ID", order.razorpayOrderId || rz?.id || "—"],
                ["Status", order.status || rz?.status],
                ["Total", fmt((order.total || order.total_amount || order.amount || 0) / (order.total ? 1 : 100) || 0)],
                ["Created", fmtDate(order.createdAt || order.created_at)],
              ]}
            />

            <DetailBlock
              title="Customer"
              icon={<User size={14} color="var(--accent-emerald)" />}
              color="var(--accent-emerald)"
              rows={[
                ["Name", custNm],
                ["Email", custEm || "—"],
                ["Phone", custPhone || "—"],
                ["Address", custAddr || "—"],
                ["City", custCity || "—"],
                ["State", custState || "—"],
              ]}
            />

            <div className="card-elevated" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <ShoppingBag size={14} color="var(--accent-rose)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Products ({order.products?.length || 0})</span>
              </div>
              {!order.products || order.products.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No products</p>
              ) : (
                order.products.map((p: any, i: number) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {p.name || p.product_name || p.title}
                        {p.quantity > 1 && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> × {p.quantity}</span>}
                      </span>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{fmt(p.total ?? p.price ?? p.unit_price ?? 0)}</span>
                    </div>
                    {p.sku && <span className="badge badge-neutral" style={{ marginTop: 4 }}>{p.sku}</span>}
                  </div>
                ))
              )}
            </div>

            {/* Payment info — Razorpay */}
            <div className="card-elevated" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <CreditCard size={14} color="var(--accent-blue)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Payment (Razorpay)</span>
              </div>
              {order.source && order.source !== "storefront" ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {SOURCE_LABELS[order.source] || order.source} order — paid outside Razorpay ({fmt(getOrderAmountRupees(order))}, marked {order.paymentStatus || "paid"})
                </p>
              ) : !rz ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No linked Razorpay order</p>
              ) : payments.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No payments recorded yet</p>
              ) : (
                payments.map((p: any) => (
                  <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--accent-blue)" }}>{p.id}</span>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{fmt(p.amount / 100)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span className={`badge ${p.status === "captured" ? "badge-success" : p.status === "failed" ? "badge-error" : "badge-warning"}`}>{p.status}</span>
                      <span className="badge badge-neutral">{p.method}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Shipment info — Delhivery */}
            <DetailBlock
              title="Shipment (Delhivery)"
              icon={<Truck size={14} color="var(--accent-emerald)" />}
              color="var(--accent-emerald)"
              rows={
                !ship
                  ? order.awb
                    ? [
                        ["AWB (stored)", order.awb],
                        ["Status", "Not found at Delhivery for this AWB"],
                      ]
                    : [["Status", "No AWB on this order yet"]]
                  : [
                      ["Waybill", ship.waybill],
                      ["Status", ship.status],
                      ["Location", ship.location || "—"],
                      ["Expected", ship.expectedDelivery || "—"],
                      ["Origin", ship.origin || "—"],
                      ["Destination", ship.destination || "—"],
                    ]
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
