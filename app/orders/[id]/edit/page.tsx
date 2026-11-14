"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import { fmt, fmtDate, getOrderBadge, getPaymentBadge, SOURCE_LABELS } from "@/components/OrderCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { deleteOrders, deleteWarnings } from "@/lib/deleteOrderClient";
import { User, MapPin, Package, AlertCircle, Plus, Trash2, Tag, History, Save } from "lucide-react";

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "failed"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];

type Item = {
  productName: string;
  qty: number;
  unitPrice: number;
  sku: string;
  size: string;
  // Not editable; sent back so storefront items keep their catalogue links.
  productId?: string;
  variantId?: string;
  image?: string;
};

const blankItem = (): Item => ({ productName: "", qty: 1, unitPrice: 0, sku: "", size: "" });

const label = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 } as const;
const section = { padding: 24, marginBottom: 20 } as const;
const heading = { fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 20 } as const;

function Field({ name, title, value, onChange, required, disabled, type = "text", mono }: {
  name: string;
  title: string;
  value: string;
  onChange: (name: string, value: string) => void;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label style={label}>{title}{required && " *"}</label>
      <input
        type={type}
        name={name}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="input-field"
        style={{ width: "100%", ...(mono ? { fontFamily: "var(--font-mono)" } : {}), ...(disabled ? { opacity: 0.6 } : {}) }}
      />
    </div>
  );
}

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Item[]>([]);

  function fillFrom(o: any) {
    const addr = o.shippingAddress || {};
    setForm({
      status: o.status || "",
      paymentStatus: o.paymentStatus || "",
      orderNumber: o.orderNumber || "",
      customerFirstName: o.customerFirstName || "",
      customerLastName: o.customerLastName || "",
      customerEmail: o.customerEmail || "",
      customerPhone: o.customerPhone || "",
      street: addr.street || "",
      city: addr.city || "",
      state: addr.state || "",
      zipCode: addr.zipCode || "",
      awb: o.awb || "",
      adminNotes: o.adminNotes || "",
    });
    setItems(
      (o.items || []).map((i: any) => ({
        productName: i.productName || i.name || "",
        qty: Number(i.quantity ?? 1),
        unitPrice: Number(i.price ?? 0),
        sku: i.sku || "",
        size: i.size || "",
        productId: i.productId,
        variantId: i.variantId,
        image: i.image,
      })),
    );
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load order");
      setOrder(data.order);
      fillFrom(data.order);
    } catch (e: any) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const manual = !!order?.manuallyCreated;
  const set = (name: string, value: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [name]: value }));
  };
  const setItem = (i: number, field: keyof Item, value: any) => {
    setSaved(false);
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { street, city, state, zipCode, ...rest } = form;
      const body: any = { ...rest, shippingAddress: { street, city, state, zipCode } };
      if (!form.paymentStatus) delete body.paymentStatus;
      body.items = items;
      if (!manual) delete body.orderNumber;
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to save order");
      setOrder(data.order);
      fillFrom(data.order);
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const { failed } = await deleteOrders([order.orderId]);
      if (failed.length) throw new Error(failed[0].error);
      router.push("/orders");
    } catch (err: any) {
      setError(err.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const itemsTotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0);
  // Mirrors updateOrder: storefront totals move by the change in item value,
  // so shipping/tax/discounts are kept.
  const savedSubtotal =
    typeof order?.subtotal === "number"
      ? order.subtotal
      : (order?.items || []).reduce((s: number, i: any) => s + Number(i.total ?? Number(i.price) * Number(i.quantity)), 0);
  const newTotal = manual || typeof order?.total !== "number" ? itemsTotal : Math.max(0, order.total + itemsTotal - savedSubtotal);
  const history: any[] = [...(order?.editHistory || [])].reverse();

  return (
    <AdminLayout
      title={order ? `Edit ${order.orderNumber || "order"}` : "Edit order"}
      back={{ href: "/orders", label: "Orders" }}
      badges={order ? <>{getPaymentBadge(order)}{getOrderBadge(order.status)}</> : undefined}
      subtitle={order ? `${fmtDate(order.createdAt)} · ${SOURCE_LABELS[order.source] || "Online store"} · ${order.orderId}` : undefined}
    >
      {loading && <LoadingState message="Loading order..." />}
      {loadError && <ErrorState message={loadError} onRetry={load} />}

      {!loading && order && (
        <form onSubmit={handleSave} style={{ maxWidth: 880, paddingBottom: 40 }}>
          {error && (
            <div style={{ padding: "12px 16px", background: "var(--accent-red-glow)", border: "1px solid rgba(229,72,77,0.3)", color: "var(--accent-red)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={18} />
              <p style={{ fontSize: 13, fontWeight: 500 }}>{error}</p>
            </div>
          )}
          {saved && (
            <div style={{ padding: "12px 16px", background: "var(--accent-emerald-glow)", border: "1px solid rgba(63,174,122,0.3)", color: "var(--accent-emerald)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
              Saved.
            </div>
          )}
          {!manual && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
              This is a storefront order paid through Razorpay. Its order number is locked. Edits here only change the record in DynamoDB;
              they don&apos;t refund the customer or change the courier shipment.
            </p>
          )}

          <div className="card-elevated" style={section}>
            <h3 style={heading}><Tag size={16} color="var(--accent-gold)" /> Status</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div>
                <label style={label}>Order status</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input-field" style={{ width: "100%" }}>
                  {!form.status && <option value="">—</option>}
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Payment status</label>
                <select value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)} className="input-field" style={{ width: "100%" }}>
                  {!form.paymentStatus && <option value="">—</option>}
                  {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Field name="orderNumber" title="Order number" value={form.orderNumber} onChange={set} required disabled={!manual} mono />
            </div>
            {!manual && form.status === "cancelled" && order.status !== "cancelled" && (
              <p style={{ fontSize: 13, color: "#b54708", background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 8, padding: "8px 12px", marginTop: 14 }}>
                Saving this only marks the order cancelled. It doesn&apos;t refund the customer on Razorpay or cancel the shipment.
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginTop: 16 }}>
              <Field name="awb" title="AWB / tracking no." value={form.awb} onChange={set} mono />
              <div>
                <label style={label}>Admin notes</label>
                <input value={form.adminNotes} onChange={(e) => set("adminNotes", e.target.value)} className="input-field" style={{ width: "100%" }} placeholder="Only visible in the admin panel" />
              </div>
            </div>
          </div>

          <div className="card-elevated" style={section}>
            <h3 style={heading}><User size={16} color="var(--accent-blue)" /> Customer</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field name="customerFirstName" title="First name" value={form.customerFirstName} onChange={set} required={!!order.customerFirstName} />
              <Field name="customerLastName" title="Last name" value={form.customerLastName} onChange={set} />
              <Field name="customerEmail" title="Email" type="email" value={form.customerEmail} onChange={set} />
              <Field name="customerPhone" title="Phone" type="tel" value={form.customerPhone} onChange={set} required={!!order.customerPhone} />
            </div>
          </div>

          <div className="card-elevated" style={section}>
            <h3 style={heading}><MapPin size={16} color="var(--accent-emerald)" /> Shipping address</h3>
            <Field name="street" title="Address line" value={form.street} onChange={set} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
              <Field name="city" title="City" value={form.city} onChange={set} />
              <Field name="state" title="State" value={form.state} onChange={set} />
              <Field name="zipCode" title="PIN code" value={form.zipCode} onChange={set} />
            </div>
            {order.awb && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
                This order already has a shipment ({order.awb}). Changing the address here doesn&apos;t update it at the courier.
              </p>
            )}
          </div>

          <div className="card-elevated" style={section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ ...heading, marginBottom: 0 }}><Package size={16} color="var(--accent-gold)" /> Items</h3>
              <button type="button" onClick={() => { setSaved(false); setItems([...items, blankItem()]); }} className="btn-ghost" style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <Plus size={14} /> Add item
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map((item, i) => (
                <div key={i} style={{ background: "var(--bg-elevated)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                    <div style={{ flex: 3 }}>
                      <label style={{ ...label, fontSize: 11 }}>Product *</label>
                      <input required value={item.productName} onChange={(e) => setItem(i, "productName", e.target.value)} className="input-field" style={{ width: "100%" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, fontSize: 11 }}>Qty *</label>
                      <input required type="number" min="1" value={item.qty} onChange={(e) => setItem(i, "qty", Number(e.target.value))} className="input-field" style={{ width: "100%" }} />
                    </div>
                    <div style={{ flex: 1.3 }}>
                      <label style={{ ...label, fontSize: 11 }}>Unit price (₹) *</label>
                      <input required type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItem(i, "unitPrice", Number(e.target.value))} className="input-field" style={{ width: "100%" }} />
                    </div>
                    {items.length > 1 && (
                      <button type="button" aria-label="Remove item" onClick={() => { setSaved(false); setItems(items.filter((_, idx) => idx !== i)); }} style={{ padding: 10, background: "transparent", border: "none", color: "var(--accent-red)", cursor: "pointer" }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, fontSize: 11 }}>SKU</label>
                      <input value={item.sku} onChange={(e) => setItem(i, "sku", e.target.value)} className="input-field" style={{ width: "100%", fontFamily: "var(--font-mono)" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, fontSize: 11 }}>Size</label>
                      <input value={item.size} onChange={(e) => setItem(i, "size", e.target.value)} className="input-field" style={{ width: "100%" }} placeholder="e.g. 50ml" />
                    </div>
                    <div style={{ flex: 1, alignSelf: "flex-end", textAlign: "right", fontSize: 12, color: "var(--text-muted)", paddingBottom: 10 }} className="mono">
                      Line total {fmt(Number(item.qty) * Number(item.unitPrice))}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ textAlign: "right", fontSize: 13, lineHeight: 1.7 }}>
                <div>Items: <span className="mono">{fmt(itemsTotal)}</span></div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Order total: <span className="mono">{fmt(newTotal)}</span></div>
                {!manual && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Shipping, tax and discounts stay as they were. This doesn&apos;t change what the customer paid on Razorpay.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
            <div>
              <button
                type="button"
                className="btn-ghost btn-danger-soft"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting || saving}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Trash2 size={14} /> {deleting ? "Deleting..." : "Delete order"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <button type="button" onClick={() => router.push("/orders")} className="btn-ghost" disabled={saving}>
                Back
              </button>
              <button type="submit" className="btn-primary" disabled={saving || deleting} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Save size={14} /> {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>

          {history.length > 0 && (
            <div className="card-elevated" style={{ ...section, marginTop: 28 }}>
              <h3 style={heading}><History size={16} color="var(--text-secondary)" /> Edit history</h3>
              {history.map((h, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                  <span className="mono" style={{ color: "var(--text-muted)" }}>{fmtDate(h.at)}</span>
                  <span style={{ marginLeft: 10 }}>
                    {h.fields.map((f: string) => {
                      const prev = h.before?.[f];
                      const shown = prev === null || prev === undefined ? "empty" : typeof prev === "object" ? "…" : String(prev);
                      return `${f} (was ${shown})`;
                    }).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}
      {order && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this order?"
          confirmLabel="Delete order"
          busyLabel="Deleting…"
          busy={deleting}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        >
          <p>{order.orderNumber || order.orderId} will be permanently removed. This can&apos;t be undone.</p>
          {(() => {
            const w = deleteWarnings([order]);
            return w.storefront || w.activeShipments ? (
              <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 13, color: "#b54708" }}>
                {w.storefront > 0 && <li>This is an online store order. Only delete test orders.</li>}
                {w.activeShipments > 0 && <li>It has an active Delhivery shipment. Deleting doesn&apos;t cancel the pickup.</li>}
              </ul>
            ) : null;
          })()}
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
}
