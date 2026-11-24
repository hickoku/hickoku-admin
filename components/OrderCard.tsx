"use client";

import Link from "next/link";
import { User, CreditCard, Truck, ShoppingBag, Ban, Loader2, FileText, Pencil, Trash2, MapPin } from "lucide-react";

// Shared order helpers + the expanded detail panel shown under an order row
// on the Orders list.

export const SOURCE_LABELS: Record<string, string> = {
  storefront: "Online store",
  amazon: "Amazon",
  influencer: "Influencer",
  club: "Hickoku Club",
  other: "Other",
};

export function getSourceBadge(source?: string) {
  if (!source || source === "storefront") return null;
  return <span className="badge badge-rose">{SOURCE_LABELS[source] || source}</span>;
}

export function getOrderBadge(status: string) {
  const s = status?.toLowerCase();
  switch (s) {
    case "paid":
    case "completed":
    case "delivered":
      return <span className="badge badge-success">{s}</span>;
    case "confirmed":
    case "processing":
    case "shipped":
      return <span className="badge badge-info">{s}</span>;
    case "pending":
      return <span className="badge badge-warning">Pending</span>;
    case "created":
      return <span className="badge badge-info">Created</span>;
    case "cancelled":
    case "failed":
      return <span className="badge badge-error">{s}</span>;
    default:
      return <span className="badge badge-neutral">{status || "—"}</span>;
  }
}

export function getPaymentBadge(order: any) {
  const s = (order.paymentStatus || order.razorpay_data?.status || "").toLowerCase();
  if (s === "paid") return <span className="badge badge-success">Paid</span>;
  if (s === "pending" || s === "created" || s === "attempted") return <span className="badge badge-warning">Unpaid</span>;
  if (s === "failed") return <span className="badge badge-error">Payment failed</span>;
  if (s === "refunded") return <span className="badge badge-neutral">Refunded</span>;
  return <span className="badge badge-neutral">{s || "—"}</span>;
}

export function getShipBadge(status?: string, hasAwb?: boolean) {
  if (!status) return <span className="badge badge-neutral">{hasAwb ? "Booked" : "Unfulfilled"}</span>;
  const s = status.toLowerCase();
  if (s.includes("delivered")) return <span className="badge badge-success">Delivered</span>;
  if (s.includes("transit") || s.includes("dispatch")) return <span className="badge badge-info">In transit</span>;
  if (s.includes("pending") || s.includes("pickup") || s.includes("manifest")) return <span className="badge badge-warning">Awaiting pickup</span>;
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

// Compact date for table rows: "14 Nov, 11:17 am", with the year only when
// it isn't the current one.
export function fmtShortDate(ts: any) {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), hour: "numeric", minute: "2-digit" });
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

export function getOrderId(order: any): string {
  return order.orderId || order.id || order.order_id || order.razorpayOrderId;
}

export function getCustomerName(order: any): string {
  return (
    (order.customerFirstName ? `${order.customerFirstName} ${order.customerLastName || ""}`.trim() : order.customer_name || order.name) || "—"
  );
}

type Row = [string, React.ReactNode];

function Panel({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16, boxShadow: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: "var(--text-muted)", display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 13 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
          <dd style={{ textAlign: "right", overflowWrap: "anywhere" }}>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OrderDetails({
  order,
  ship,
  onCancel,
  cancelling,
  onDelete,
}: {
  order: any;
  ship: any;
  onCancel?: () => void;
  cancelling?: boolean;
  onDelete?: () => void;
}) {
  const ordId = getOrderId(order);
  const addr = order.shippingAddress || {};
  const custEm = order.customerEmail || order.email || "";
  const custPhone = order.customerPhone || order.phone || "";
  const rz = order.razorpay_data;
  const payments = rz?.payments?.items || [];
  const isManual = order.source && order.source !== "storefront";

  const totals: Row[] = [];
  if (typeof order.subtotal === "number") totals.push(["Subtotal", fmt(order.subtotal)]);
  // Orders placed after offers moved to the admin list each offer used (product offers are
  // already inside the item prices; cart offers make up surpriseDiscount).
  const applied: { id: string; name: string; amount: number; level?: string }[] = Array.isArray(order.appliedOffers) ? order.appliedOffers : [];
  for (const a of applied.filter((x) => x.level !== "cart")) totals.push([`${a.name} (in prices)`, <span key={a.id} style={{ color: "var(--text-muted)" }}>− {fmt(a.amount)}</span>]);
  const cartOffers = applied.filter((x) => x.level === "cart");
  if (cartOffers.length) for (const a of cartOffers) totals.push([a.name, `− ${fmt(a.amount)}`]);
  else if (order.surpriseDiscount) totals.push(["Discount", `− ${fmt(order.surpriseDiscount)}`]);
  if (typeof order.shippingCost === "number") totals.push(["Shipping", fmt(order.shippingCost)]);
  totals.push(["Total", <strong key="t">{fmt(getOrderAmountRupees(order))}</strong>]);

  const orderRows: Row[] = [
    ["Order ID", <span key="i" className="code">{ordId}</span>],
    ["Channel", SOURCE_LABELS[order.source] || "Online store"],
    ["Placed", fmtDate(order.createdAt || order.created_at)],
  ];
  if (order.updatedAt) orderRows.push(["Updated", fmtDate(order.updatedAt)]);

  const shipRows: Row[] = !ship
    ? order.awb
      ? [["AWB", <span key="a" className="code">{order.awb}</span>], ["Tracking", "Not found at Delhivery"]]
      : [["AWB", "Not booked yet"]]
    : [
        ["AWB", <span key="a" className="code">{ship.waybill}</span>],
        ["Status", ship.status],
        ["Location", ship.location || "—"],
        ["Expected", ship.expectedDelivery ? fmtDate(ship.expectedDelivery) : "—"],
        ["Route", ship.origin || ship.destination ? `${ship.origin || "?"} → ${ship.destination || "?"}` : "—"],
      ];

  return (
    <div className="animate-in" style={{ padding: "16px 20px 20px", background: "var(--bg-elevated)" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
        <button className="btn-ghost btn-sm" onClick={() => window.open(`/api/invoice?orderId=${encodeURIComponent(ordId)}`, "_blank", "noopener")}>
          <FileText size={14} /> Invoice
        </button>
        {order.orderId && (
          <Link href={`/orders/${encodeURIComponent(order.orderId)}/edit`} className="btn-ghost btn-sm" style={{ textDecoration: "none" }}>
            <Pencil size={14} /> Edit
          </Link>
        )}
        {onCancel && (
          <button className="btn-ghost btn-sm" onClick={onCancel} disabled={cancelling}>
            {cancelling ? <Loader2 size={14} style={{ animation: "spin 0.6s linear infinite" }} /> : <Ban size={14} />}
            {cancelling ? "Cancelling..." : "Cancel order"}
          </button>
        )}
        {onDelete && (
          <button className="btn-ghost btn-sm btn-danger-soft" onClick={onDelete}>
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title={`Items (${order.products?.length || 0})`} icon={<ShoppingBag size={15} />}>
            {!order.products?.length ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No items</p>
            ) : (
              <div>
                {order.products.map((p: any, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--bg-hover)", border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                      <ShoppingBag size={16} />
                      {p.image && /^https?:\/\//.test(p.image) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image}
                          alt=""
                          onError={(e) => (e.currentTarget.style.display = "none")}
                          style={{ width: 40, height: 40, objectFit: "cover", position: "absolute", inset: 0, background: "#fff" }}
                        />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name || p.product_name || p.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{[p.size, p.sku && `SKU ${p.sku}`].filter(Boolean).join(" · ") || " "}</div>
                    </div>
                    <div className="mono" style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {fmt(p.price ?? 0)} × {p.quantity ?? 1}
                    </div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 600, width: 90, textAlign: "right" }}>
                      {fmt(p.total ?? (p.price ?? 0) * (p.quantity ?? 1))}
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 10 }}>
                  <Rows rows={totals} />
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Payment" icon={<CreditCard size={15} />} action={getPaymentBadge(order)}>
            {isManual ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{SOURCE_LABELS[order.source] || order.source} order, paid outside Razorpay.</p>
            ) : !rz ? (
              <Rows rows={[["Razorpay order", order.razorpayOrderId ? <span key="r" className="code">{order.razorpayOrderId}</span> : "Not linked"]]} />
            ) : payments.length === 0 ? (
              <Rows rows={[["Razorpay order", <span key="r" className="code">{rz.id}</span>], ["Payments", "None recorded yet"]]} />
            ) : (
              payments.map((p: any) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
                  <span className="code" style={{ flex: 1 }}>{p.id}</span>
                  <span className="badge badge-neutral" style={{ textTransform: "uppercase" }}>{p.method}</span>
                  <span className={`badge ${p.status === "captured" ? "badge-success" : p.status === "failed" ? "badge-error" : "badge-warning"}`}>{p.status}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{fmt(p.amount / 100)}</span>
                </div>
              ))
            )}
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="Customer" icon={<User size={15} />}>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>{getCustomerName(order)}</div>
              {custEm && <div style={{ color: "var(--accent-blue)" }}>{custEm}</div>}
              {custPhone && <div style={{ color: "var(--text-secondary)" }}>{custPhone}</div>}
            </div>
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--text-muted)", fontSize: 12, marginBottom: 2 }}>
                <MapPin size={12} /> Shipping address
              </div>
              {addr.street || order.address ? (
                <>
                  <div>{addr.street || order.address}</div>
                  <div>{[addr.city || order.city, addr.state || order.state, addr.zipCode].filter(Boolean).join(", ")}</div>
                </>
              ) : (
                <div>—</div>
              )}
            </div>
            {order.adminNotes && (
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, fontSize: 13 }}>
                <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 2 }}>Notes</div>
                {order.adminNotes}
              </div>
            )}
          </Panel>

          <Panel title="Shipment (Delhivery)" icon={<Truck size={15} />} action={getShipBadge(ship?.status, !!order.awb)}>
            <Rows rows={shipRows} />
          </Panel>

          <Panel title="Order" icon={<FileText size={15} />}>
            <Rows rows={orderRows} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
