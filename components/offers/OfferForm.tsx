"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Card, Switch } from "@/components/FormBits";
import { priceProduct, priceCart, offerChip, isLive, type Offer } from "@/lib/offerEngine";
import { AlertCircle, Save, Trash2, Megaphone, Percent, CalendarClock, Calculator, Radio } from "lucide-react";

export type OfferProduct = { id: string; name: string; image: string | null; price: number };

export type OfferFormValue = {
  name: string;
  title: string;
  message: string;
  level: "product" | "cart";
  kind: "percent" | "flat" | "per_item";
  value: string;
  appliesTo: "all" | "selected";
  productIds: string[];
  minItems: string;
  minSubtotal: string;
  startsAt: string; // datetime-local, IST
  endsAt: string;
  enabled: boolean;
  sequence: string;
  combinable: boolean;
};

const IST_MS = 5.5 * 3600 * 1000;
// ISO → "YYYY-MM-DDTHH:mm" in IST for <input type="datetime-local">
export const toIstInput = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 16) : "");
// "YYYY-MM-DDTHH:mm" (IST) → ISO
const fromIstInput = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : null);
export const fmtIst = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export const emptyOffer = (sequence = 1): OfferFormValue => ({
  name: "",
  title: "",
  message: "",
  level: "product",
  kind: "percent",
  value: "",
  appliesTo: "all",
  productIds: [],
  minItems: "0",
  minSubtotal: "0",
  startsAt: "",
  endsAt: "",
  enabled: true,
  sequence: String(sequence),
  combinable: true,
});

export function fromOffer(o: Offer): OfferFormValue {
  return {
    name: o.name,
    title: o.title || "",
    message: o.message || "",
    level: o.level,
    kind: o.kind,
    value: String(o.value),
    appliesTo: o.productIds?.length ? "selected" : "all",
    productIds: o.productIds || [],
    minItems: String(o.minItems || 0),
    minSubtotal: String(o.minSubtotal || 0),
    startsAt: toIstInput(o.startsAt),
    endsAt: toIstInput(o.endsAt),
    enabled: o.enabled,
    sequence: String(o.sequence),
    combinable: o.combinable,
  };
}

function toOffer(f: OfferFormValue, id: string): Offer {
  return {
    id,
    name: f.name || "This offer",
    title: f.title,
    message: f.message,
    level: f.level,
    kind: f.kind,
    value: Number(f.value) || 0,
    productIds: f.appliesTo === "selected" ? f.productIds : [],
    minItems: f.level === "cart" ? Number(f.minItems) || 0 : 0,
    minSubtotal: f.level === "cart" ? Number(f.minSubtotal) || 0 : 0,
    startsAt: fromIstInput(f.startsAt),
    endsAt: fromIstInput(f.endsAt),
    enabled: f.enabled,
    sequence: Number(f.sequence) || 0,
    combinable: f.combinable,
    couponCode: null,
  };
}

const label = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 } as const;
const hint = { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } as const;
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; sub?: string; disabled?: boolean }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 8 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: o.disabled ? "not-allowed" : "pointer",
              opacity: o.disabled ? 0.45 : 1,
              border: `1.5px solid ${on ? "var(--text-primary)" : "var(--border-bright)"}`,
              background: on ? "var(--bg-hover)" : "#fff",
              color: "var(--text-primary)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</div>
            {o.sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

export default function OfferForm({
  initial,
  offerId,
  otherOffers,
  products,
  isProd,
}: {
  initial: OfferFormValue;
  offerId?: string;
  otherOffers: Offer[];
  products: OfferProduct[];
  isProd: boolean;
}) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [form, setForm] = useState<OfferFormValue>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty = JSON.stringify(form) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof OfferFormValue>(k: K, v: OfferFormValue[K]) => setForm((f) => ({ ...f, [k]: v }));

  const draft = useMemo(() => toOffer(form, offerId || "__draft__"), [form, offerId]);
  const chip = offerChip(draft);
  const now = new Date();
  const status = !form.enabled ? "Off" : isLive(draft, now) ? "Live now" : draft.endsAt && new Date(draft.endsAt) <= now ? "Ended" : "Scheduled";

  // Preview: this offer as if it were live, together with the other offers that are live now.
  const preview = useMemo(() => {
    const asLive: Offer = { ...draft, enabled: true, startsAt: null, endsAt: null };
    const others = otherOffers.filter((o) => o.id !== offerId && isLive(o));
    const all = [...others, asLive];
    const sample = (draft.productIds?.length ? products.find((p) => draft.productIds!.includes(p.id)) : products[0]) || { id: "sample", name: "Sample product", price: 499, image: null };
    const without = priceProduct(sample.price, sample.id, others);
    const withIt = priceProduct(sample.price, sample.id, all);
    const carts = [1, 2, 3].map((qty) => {
      const a = priceCart([{ productId: sample.id, price: without.price, quantity: qty }], others);
      const b = priceCart([{ productId: sample.id, price: withIt.price, quantity: qty }], all);
      return { qty, before: a.total, after: b.total, applied: b.applied };
    });
    return { sample, without, withIt, carts, othersLive: others };
  }, [draft, otherOffers, offerId, products]);

  async function doSave() {
    setSaving(true);
    setError(null);
    setConfirmLive(false);
    try {
      const body = {
        ...form,
        startsAt: fromIstInput(form.startsAt),
        endsAt: fromIstInput(form.endsAt),
      };
      const res = await fetch(offerId ? `/api/offers/${encodeURIComponent(offerId)}` : "/api/offers", {
        method: offerId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Couldn't save");
      const saved = fromOffer(data.offer);
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      showToast(offerId ? "Offer saved" : "Offer created");
      if (!offerId) router.replace(`/offers/${encodeURIComponent(data.offer.id)}`);
    } catch (e: any) {
      setError(e.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(offerId!)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Couldn't delete");
      setBaseline(JSON.stringify(form));
      router.push("/offers?deleted=" + encodeURIComponent(form.name));
    } catch (e: any) {
      showToast(e.message, true);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const text = (k: "name" | "title" | "message", placeholder: string, max: number) => (
    <input className="input-field" value={form[k]} maxLength={max} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} style={{ width: "100%" }} />
  );

  const valueUnit = form.kind === "percent" ? "%" : "₹";

  return (
    <>
      {error && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--accent-red-glow)", border: "1px solid #fecdca", color: "#b42318", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}
      {isProd && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "#fffaeb", border: "1px solid #fedf89", color: "#b54708", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          <Radio size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            You are editing <b>live</b> offers. Saved changes reach hickoku.com within about a minute and change what customers pay.
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
        <div>
          <Card title="What customers see" icon={<Megaphone size={17} />}>
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
                <div>
                  <label style={label}>Name *</label>
                  {text("name", "e.g. Launch Offer", 40)}
                  <p style={hint}>Short tag. Also the discount line name in the cart.</p>
                </div>
                <div>
                  <label style={label}>Headline</label>
                  {text("title", "e.g. Flat 50% Limited Launch Promo", 80)}
                  <p style={hint}>Shown on offer banners and the product page.</p>
                </div>
              </div>
              <div>
                <label style={label}>Description</label>
                {text("message", "e.g. Get an extra ₹25 off per bottle when you buy 2 or more.", 200)}
              </div>
            </div>
          </Card>

          <Card title="Discount" icon={<Percent size={17} />}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={label}>Applies to</label>
                <Segmented
                  value={form.level}
                  onChange={(v) => setForm((f) => ({ ...f, level: v, kind: v === "product" && f.kind === "per_item" ? "percent" : f.kind }))}
                  options={[
                    { value: "product", label: "Product price", sub: "Lowers the price shown on products" },
                    { value: "cart", label: "Cart total", sub: "Taken off at checkout, can need conditions" },
                  ]}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={label}>Type</label>
                  <Segmented
                    value={form.kind}
                    onChange={(v) => set("kind", v)}
                    options={[
                      { value: "percent", label: "Percentage" },
                      { value: "flat", label: "Fixed amount" },
                      { value: "per_item", label: "Per bottle", disabled: form.level !== "cart" },
                    ]}
                  />
                </div>
                <div>
                  <label style={label}>{form.kind === "percent" ? "Percent off *" : form.kind === "per_item" ? "₹ off each bottle *" : "₹ off *"}</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14 }}>{valueUnit}</span>
                    <input className="input-field" type="number" min={0} step={form.kind === "percent" ? 1 : 0.5} value={form.value} onChange={(e) => set("value", e.target.value)} style={{ width: "100%", paddingLeft: 30 }} />
                  </div>
                </div>
              </div>
              <div>
                <label style={label}>Products</label>
                <div style={{ display: "flex", gap: 16, fontSize: 14, marginBottom: 8 }}>
                  {(["all", "selected"] as const).map((v) => (
                    <label key={v} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input type="radio" name="appliesTo" checked={form.appliesTo === v} onChange={() => set("appliesTo", v)} />
                      {v === "all" ? "All products" : "Only selected products"}
                    </label>
                  ))}
                </div>
                {form.appliesTo === "selected" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                    {products.map((p) => {
                      const on = form.productIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, border: `1.5px solid ${on ? "var(--text-primary)" : "var(--border)"}`, borderRadius: 10, cursor: "pointer", fontSize: 13 }}
                        >
                          <input type="checkbox" checked={on} onChange={() => set("productIds", on ? form.productIds.filter((x) => x !== p.id) : [...form.productIds, p.id])} />
                          {p.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image.startsWith("/") ? `${process.env.NEXT_PUBLIC_STOREFRONT_URL}${p.image}` : p.image} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
                          )}
                          <span style={{ fontWeight: 500 }}>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {form.level === "cart" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={label}>Minimum bottles in cart</label>
                    <input className="input-field" type="number" min={0} step={1} value={form.minItems} onChange={(e) => set("minItems", e.target.value)} style={{ width: "100%" }} />
                    <p style={hint}>0 = no minimum. The cart shows an &quot;add N more&quot; nudge.</p>
                  </div>
                  <div>
                    <label style={label}>Minimum cart value (₹)</label>
                    <input className="input-field" type="number" min={0} step={1} value={form.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} style={{ width: "100%" }} />
                    <p style={hint}>Counted after product discounts. 0 = no minimum.</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Schedule (IST)" icon={<CalendarClock size={17} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {(["startsAt", "endsAt"] as const).map((k) => (
                <div key={k}>
                  <label style={label}>{k === "startsAt" ? "Starts" : "Ends"}</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="input-field" type="datetime-local" value={form[k]} onChange={(e) => set(k, e.target.value)} style={{ flex: 1 }} />
                    {form[k] && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => set(k, "")}>
                        Clear
                      </button>
                    )}
                  </div>
                  <p style={hint}>{form[k] ? fmtIst(fromIstInput(form[k])) + " IST" : k === "startsAt" ? "Empty = starts as soon as it's on" : "Empty = runs until you turn it off"}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ position: "sticky", top: 24, display: "grid", gap: 16 }}>
          <div className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <label htmlFor="offer-enabled" style={{ fontWeight: 600, cursor: "pointer" }}>
                  Offer on
                </label>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Status: {status}</div>
              </div>
              <Switch id="offer-enabled" checked={form.enabled} onChange={(v) => set("enabled", v)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <label htmlFor="offer-combine" style={{ fontWeight: 600, cursor: "pointer" }}>
                  Combine with other offers
                </label>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Off = when this applies, other {form.level === "cart" ? "cart" : "product"} offers don&apos;t.</div>
              </div>
              <Switch id="offer-combine" checked={form.combinable} onChange={(v) => set("combinable", v)} />
            </div>
            <div>
              <label style={label}>Order</label>
              <input className="input-field" type="number" min={0} max={999} step={1} value={form.sequence} onChange={(e) => set("sequence", e.target.value)} style={{ width: 90 }} />
              <p style={hint}>Lower runs first. Each offer applies to the price left by the one before.</p>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Calculator size={16} style={{ color: "var(--text-muted)" }} />
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Price preview</h3>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, background: "var(--bg-hover)", borderRadius: 10, marginBottom: 12 }}>
              <div style={{ background: "#B33D14", color: "#fff", borderRadius: 8, padding: "8px 10px", textAlign: "center", minWidth: 64 }}>
                <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1 }}>{chip.big}</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", marginTop: 3 }}>{chip.small}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B33D14", textTransform: "uppercase" }}>{form.name || "Offer name"}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{form.title || form.name || "Headline"}</div>
                {form.message && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{form.message}</div>}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
              {preview.sample.name}, list price {inr(preview.sample.price)}
            </div>
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 0", textAlign: "left" }}></th>
                  <th style={{ padding: "6px 0", textAlign: "right" }}>Without</th>
                  <th style={{ padding: "6px 0", textAlign: "right" }}>With this</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "6px 0" }}>Product price</td>
                  <td style={{ padding: "6px 0", textAlign: "right" }}>{inr(preview.without.price)}</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{inr(preview.withIt.price)}</td>
                </tr>
                {preview.carts.map((c) => (
                  <tr key={c.qty}>
                    <td style={{ padding: "6px 0" }}>
                      Cart of {c.qty}
                    </td>
                    <td style={{ padding: "6px 0", textAlign: "right" }}>{inr(c.before)}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: c.after < c.before ? "var(--accent-emerald)" : undefined }}>{inr(c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...hint, marginTop: 10 }}>
              As if this offer were live now, together with {preview.othersLive.length ? preview.othersLive.map((o) => o.name).join(", ") : "no other offers"}.
            </p>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <button className="btn-primary" onClick={() => (isProd ? setConfirmLive(true) : doSave())} disabled={saving || deleting || (!dirty && !!offerId)} style={{ width: "100%", padding: "10px 14px" }}>
              <Save size={15} /> {saving ? "Saving…" : offerId ? (dirty ? "Save changes" : "Saved") : "Create offer"}
            </button>
            {offerId && (
              <button className="btn-ghost btn-danger-soft" onClick={() => setConfirmDelete(true)} disabled={saving || deleting} style={{ width: "100%" }}>
                <Trash2 size={14} /> Delete offer
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${form.name || "this offer"}?`}
        confirmLabel="Delete offer"
        tone="danger"
        busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      >
        The discount stops on the store{isProd ? " (live)" : ""} within about a minute. To pause it instead, turn it off.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmLive}
        title="Save to the live store?"
        confirmLabel="Save live"
        tone="primary"
        busy={saving}
        onConfirm={doSave}
        onClose={() => setConfirmLive(false)}
      >
        This changes what customers pay on hickoku.com within about a minute.
      </ConfirmDialog>
      {toast}
    </>
  );
}
