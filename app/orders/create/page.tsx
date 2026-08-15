"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { User, MapPin, Package, AlertCircle, Plus, Trash2, Tag } from "lucide-react";

const SOURCES = [
  { value: "amazon", label: "Amazon" },
  { value: "influencer", label: "Influencer / Marketing" },
  { value: "other", label: "Other" },
];

export default function CreateManualOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    source: "amazon",
    customOrderNumber: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pin: "",
  });

  const [items, setItems] = useState([{ productName: "", qty: 1, unitPrice: 0 }]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleItemChange(index: number, field: string, value: any) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  }

  function addItem() {
    setItems([...items, { productName: "", qty: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create order");
      router.push("/orders");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const total = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

  return (
    <AdminLayout title="Create Order" subtitle="Books a real Delhivery pickup and adds the order to the panel — for Amazon, influencer & other non-storefront sales">
      <form onSubmit={handleSubmit} style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 40 }}>
        {error && (
          <div style={{ padding: "12px 16px", background: "var(--accent-red-glow)", border: "1px solid rgba(229,72,77,0.3)", color: "var(--accent-red)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={18} />
            <p style={{ fontSize: 13, fontWeight: 500 }}>{error}</p>
          </div>
        )}

        {/* Source + Order Identity */}
        <div className="card-elevated" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Tag size={16} color="var(--accent-gold)" /> Source & Order Identity
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Source *</label>
              <select required name="source" value={form.source} onChange={handleChange} className="input-field" style={{ width: "100%" }}>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Custom Order Number *</label>
              <input required name="customOrderNumber" placeholder="e.g. AMZ-40921 or HK-INF-001" value={form.customOrderNumber} onChange={handleChange} className="input-field" style={{ width: "100%", fontFamily: "var(--font-mono)" }} />
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
            Shown in Delhivery and used to tell this order apart from real storefront checkouts on the Orders page.
          </p>
        </div>

        {/* Customer Details */}
        <div className="card-elevated" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <User size={16} color="var(--accent-blue)" /> Customer Details
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>First Name *</label>
              <input required name="firstName" value={form.firstName} onChange={handleChange} className="input-field" style={{ width: "100%" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Last Name</label>
              <input name="lastName" value={form.lastName} onChange={handleChange} className="input-field" style={{ width: "100%" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                Email <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional — Amazon doesn't share it)</span>
              </label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="input-field" style={{ width: "100%" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Phone *</label>
              <input required type="tel" name="phone" value={form.phone} onChange={handleChange} className="input-field" style={{ width: "100%" }} />
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        <div className="card-elevated" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <MapPin size={16} color="var(--accent-emerald)" /> Shipping Address
          </h3>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Address Line *</label>
            <input required name="address" value={form.address} onChange={handleChange} className="input-field" style={{ width: "100%" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>City *</label>
              <input required name="city" value={form.city} onChange={handleChange} className="input-field" style={{ width: "100%" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>State *</label>
              <input required name="state" value={form.state} onChange={handleChange} className="input-field" style={{ width: "100%" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>PIN Code *</label>
              <input required name="pin" value={form.pin} onChange={handleChange} className="input-field" style={{ width: "100%" }} />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card-elevated" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <Package size={16} color="var(--accent-gold)" /> Order Items
            </h3>
            <button type="button" onClick={addItem} className="btn-ghost" style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <Plus size={14} /> Add Item
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            Unit price is the real/invoice value — set it to ₹0 for free influencer sends.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((item, index) => (
              <div key={index} style={{ display: "flex", gap: 12, alignItems: "flex-end", background: "var(--bg-elevated)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Product *</label>
                  <input required value={item.productName} onChange={(e) => handleItemChange(index, "productName", e.target.value)} className="input-field" style={{ width: "100%" }} placeholder="Product name" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Qty *</label>
                  <input required type="number" min="1" value={item.qty} onChange={(e) => handleItemChange(index, "qty", Number(e.target.value))} className="input-field" style={{ width: "100%" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Unit Price (₹) *</label>
                  <input required type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => handleItemChange(index, "unitPrice", Number(e.target.value))} className="input-field" style={{ width: "100%" }} />
                </div>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(index)} style={{ padding: 10, background: "transparent", border: "none", color: "var(--accent-red)", cursor: "pointer" }}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, textAlign: "right", fontSize: 14, fontWeight: 600 }}>
            Total Value: ₹{total.toFixed(2)}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 16 }}>
          <button type="button" onClick={() => router.back()} className="btn-ghost" disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Booking pickup with Delhivery..." : "Create Order & Book Pickup"}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}
