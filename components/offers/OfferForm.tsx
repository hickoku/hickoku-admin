"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Card, Switch } from "@/components/FormBits";
import { priceProduct, priceCart, offerChip, isLive, type Offer, type OfferLevel, type CartLine, type PricingContext } from "@/lib/offerEngine";
import { OFFER_TYPES, summaryLines } from "@/lib/offerText";
import { AlertCircle, Save, Trash2, Megaphone, Percent, CalendarClock, Calculator, Radio, Shapes, Ticket, Users, Gift, Truck, ListChecks } from "lucide-react";

export type OfferProduct = { id: string; name: string; image: string | null; price: number };

export type OfferFormValue = {
  name: string;
  title: string;
  message: string;
  badge: string;
  level: OfferLevel;
  kind: "percent" | "flat" | "per_item";
  value: string;
  maxDiscount: string;
  appliesTo: "all" | "selected";
  productIds: string[];
  minItems: string;
  minSubtotal: string;
  buyQty: string;
  getQty: string;
  getAppliesTo: "same" | "selected";
  getProductIds: string[];
  getKind: "free" | "percent";
  getValue: string;
  giftProductId: string;
  method: "automatic" | "code";
  couponCode: string;
  eligibility: "everyone" | "first_order";
  usageLimit: string;
  oncePerCustomer: boolean;
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
  badge: "",
  level: "product",
  kind: "percent",
  value: "",
  maxDiscount: "",
  appliesTo: "all",
  productIds: [],
  minItems: "0",
  minSubtotal: "0",
  buyQty: "2",
  getQty: "1",
  getAppliesTo: "same",
  getProductIds: [],
  getKind: "free",
  getValue: "50",
  giftProductId: "",
  method: "automatic",
  couponCode: "",
  eligibility: "everyone",
  usageLimit: "",
  oncePerCustomer: false,
  startsAt: "",
  endsAt: "",
  enabled: true,
  sequence: String(sequence),
  combinable: true,
});

export function fromOffer(o: Offer): OfferFormValue {
  const e = emptyOffer(o.sequence);
  return {
    ...e,
    name: o.name,
    title: o.title || "",
    message: o.message || "",
    badge: o.badge || "",
    level: o.level,
    kind: o.kind,
    value: o.value ? String(o.value) : "",
    maxDiscount: o.maxDiscount ? String(o.maxDiscount) : "",
    appliesTo: o.productIds?.length ? "selected" : "all",
    productIds: o.productIds || [],
    minItems: String(o.minItems || 0),
    minSubtotal: String(o.minSubtotal || 0),
    buyQty: o.buyQty ? String(o.buyQty) : e.buyQty,
    getQty: o.getQty ? String(o.getQty) : e.getQty,
    getAppliesTo: o.getProductIds?.length ? "selected" : "same",
    getProductIds: o.getProductIds || [],
    getKind: o.getKind === "percent" ? "percent" : "free",
    getValue: o.getValue ? String(o.getValue) : e.getValue,
    giftProductId: o.giftProductId || "",
    method: o.couponCode ? "code" : "automatic",
    couponCode: o.couponCode || "",
    eligibility: o.eligibility === "first_order" ? "first_order" : "everyone",
    usageLimit: o.usageLimit ? String(o.usageLimit) : "",
    oncePerCustomer: !!o.oncePerCustomer,
    startsAt: toIstInput(o.startsAt),
    endsAt: toIstInput(o.endsAt),
    enabled: o.enabled,
    sequence: String(o.sequence),
    combinable: o.combinable,
  };
}

function toOffer(f: OfferFormValue, id: string): Offer {
  const order = f.level !== "product";
  const usesProducts = f.level === "product" || f.level === "cart" || f.level === "bxgy";
  return {
    id,
    name: f.name || "This offer",
    title: f.title,
    message: f.message,
    badge: f.badge,
    level: f.level,
    kind: f.kind,
    value: f.level === "product" || f.level === "cart" ? Number(f.value) || 0 : 0,
    maxDiscount: f.level === "cart" && f.kind === "percent" ? Number(f.maxDiscount) || 0 : 0,
    productIds: usesProducts && f.appliesTo === "selected" ? f.productIds : [],
    minItems: order ? Number(f.minItems) || 0 : 0,
    minSubtotal: order ? Number(f.minSubtotal) || 0 : 0,
    buyQty: Number(f.buyQty) || 0,
    getQty: Number(f.getQty) || 0,
    getProductIds: f.level === "bxgy" && f.getAppliesTo === "selected" ? f.getProductIds : [],
    getKind: f.getKind,
    getValue: Number(f.getValue) || 0,
    giftProductId: f.level === "gift" ? f.giftProductId || null : null,
    eligibility: order ? f.eligibility : "everyone",
    usageLimit: order ? Number(f.usageLimit) || 0 : 0,
    oncePerCustomer: order && f.oncePerCustomer,
    startsAt: fromIstInput(f.startsAt),
    endsAt: fromIstInput(f.endsAt),
    enabled: f.enabled,
    sequence: Number(f.sequence) || 0,
    combinable: f.level === "gift" || f.level === "shipping" ? true : f.combinable,
    couponCode: order && f.method === "code" ? f.couponCode.trim().toUpperCase() || "CODE" : null,
  };
}

const label = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 } as const;
const hint = { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } as const;
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const imgSrc = (p: OfferProduct) => (p.image?.startsWith("/") ? `${process.env.NEXT_PUBLIC_STOREFRONT_URL}${p.image}` : p.image || "");

function Segmented<T extends string>({ value, onChange, options, cols }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; sub?: string; disabled?: boolean }[]; cols?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols || options.length}, minmax(0, 1fr))`, gap: 8 }}>
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

// Checkbox grid (multi) or radio grid (single) of products.
function ProductPicker({ products, selected, onChange, single }: { products: OfferProduct[]; selected: string[]; onChange: (ids: string[]) => void; single?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
      {products.map((p) => {
        const on = selected.includes(p.id);
        return (
          <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, border: `1.5px solid ${on ? "var(--text-primary)" : "var(--border)"}`, borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
            <input
              type={single ? "radio" : "checkbox"}
              checked={on}
              onChange={() => onChange(single ? [p.id] : on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
            />
            {p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc(p)} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
            )}
            <span style={{ fontWeight: 500 }}>{p.name}</span>
            {single && <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 12 }}>{inr(p.price)}</span>}
          </label>
        );
      })}
    </div>
  );
}

function Radios<T extends string>({ name, value, onChange, options }: { name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14 }}>
      {options.map((o) => (
        <label key={o.value} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

const randomCode = () => Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

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
  const lvl = form.level;
  const isOrder = lvl !== "product";

  const draft = useMemo(() => toOffer(form, offerId || "__draft__"), [form, offerId]);
  const chip = offerChip(draft);
  const now = new Date();
  const status = !form.enabled ? "Off" : isLive(draft, now) ? "Live now" : draft.endsAt && new Date(draft.endsAt) <= now ? "Ended" : "Scheduled";

  // Preview: this offer as if it were live, together with the other offers that are live now.
  const preview = useMemo(() => {
    const asLive: Offer = { ...draft, enabled: true, startsAt: null, endsAt: null, usedCount: 0 };
    const others = otherOffers.filter((o) => o.id !== offerId && isLive(o));
    const all = [...others, asLive];
    const ctx: PricingContext = { codes: draft.couponCode ? [draft.couponCode] : [], firstOrder: true };
    const pool = draft.productIds?.length ? products.filter((p) => draft.productIds!.includes(p.id)) : products;
    const sample = pool[0] || products[0] || { id: "sample", name: "Sample product", price: 499, image: null };
    const without = priceProduct(sample.price, sample.id, others);
    const withIt = priceProduct(sample.price, sample.id, all);
    // Test carts: different bottles from the pool, so "cheapest is free" shows clearly.
    const sizes = lvl === "bxgy" ? [draft.buyQty || 1, (draft.buyQty || 1) + (draft.getQty || 1), (draft.buyQty || 1) + (draft.getQty || 1) + 1] : [1, 2, 3];
    const list = pool.length ? pool : [sample];
    const carts = [...new Set(sizes.map((n) => Math.min(10, n)))].map((qty) => {
      const picked = Array.from({ length: qty }, (_, i) => list[i % list.length]);
      const lines = (withOffer: boolean): CartLine[] =>
        picked.map((p) => ({ productId: p.id, price: priceProduct(p.price, p.id, withOffer ? all : others).price, quantity: 1 }));
      const a = priceCart(lines(false), others, now, ctx);
      const b = priceCart(lines(true), all, now, ctx);
      const mine = b.applied.find((x) => x.id === asLive.id);
      const gift = b.gifts.find((g) => g.offerId === asLive.id);
      const ship = b.freeShipping?.offerId === asLive.id;
      return { qty, names: picked.map((p) => p.name), before: a.total, after: b.total, mine, gift, ship };
    });
    return { sample, without, withIt, carts, othersLive: others };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, otherOffers, offerId, products, lvl]);

  const giftName = products.find((p) => p.id === form.giftProductId)?.name;

  async function doSave() {
    setSaving(true);
    setError(null);
    setConfirmLive(false);
    try {
      const body = { ...form, startsAt: fromIstInput(form.startsAt), endsAt: fromIstInput(form.endsAt) };
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

  const text = (k: "name" | "title" | "message" | "badge", placeholder: string, max: number) => (
    <input className="input-field" value={form[k]} maxLength={max} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} style={{ width: "100%" }} />
  );
  const num = (k: keyof OfferFormValue, opts: { unit?: string; step?: number; min?: number; max?: number; placeholder?: string; width?: number | string } = {}) => (
    <div style={{ position: "relative", width: opts.width || "100%" }}>
      {opts.unit && <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14 }}>{opts.unit}</span>}
      <input
        className="input-field"
        type="number"
        min={opts.min ?? 0}
        max={opts.max}
        step={opts.step ?? 1}
        placeholder={opts.placeholder}
        value={form[k] as string}
        onChange={(e) => set(k, e.target.value as never)}
        style={{ width: "100%", paddingLeft: opts.unit ? 30 : undefined }}
      />
    </div>
  );

  const conditions = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <label style={label}>Minimum bottles in cart</label>
        {num("minItems")}
        <p style={hint}>0 = no minimum. The cart shows an &quot;add N more&quot; nudge.</p>
      </div>
      <div>
        <label style={label}>Minimum cart value</label>
        {num("minSubtotal", { unit: "₹" })}
        <p style={hint}>Counted after product discounts. 0 = no minimum.</p>
      </div>
    </div>
  );

  const productScope = (title: string) => (
    <div>
      <label style={label}>{title}</label>
      <div style={{ marginBottom: 8 }}>
        <Radios name="appliesTo" value={form.appliesTo} onChange={(v) => set("appliesTo", v)} options={[{ value: "all", label: "All products" }, { value: "selected", label: "Only selected products" }]} />
      </div>
      {form.appliesTo === "selected" && <ProductPicker products={products} selected={form.productIds} onChange={(v) => set("productIds", v)} />}
    </div>
  );

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
          <Card title="Offer type" icon={<Shapes size={17} />}>
            <Segmented
              cols={3}
              value={lvl}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  level: v,
                  kind: v === "product" && f.kind === "per_item" ? "percent" : f.kind,
                }))
              }
              options={OFFER_TYPES}
            />
          </Card>

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
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
                <div>
                  <label style={label}>Description</label>
                  {text("message", lvl === "bxgy" ? "e.g. Add any 3 attars, the cheapest one is free." : "e.g. Get an extra ₹25 off per bottle when you buy 2 or more.", 200)}
                </div>
                <div>
                  <label style={label}>Badge on product cards</label>
                  {text("badge", lvl === "bxgy" ? "e.g. BUY 2 GET 1" : "e.g. 15% OFF", 24)}
                  <p style={hint}>Empty = no badge.</p>
                </div>
              </div>
            </div>
          </Card>

          {isOrder && (
            <Card title="How customers get it" icon={<Ticket size={17} />}>
              <div style={{ display: "grid", gap: 12 }}>
                <Segmented
                  value={form.method}
                  onChange={(v) => setForm((f) => ({ ...f, method: v, couponCode: v === "code" && !f.couponCode ? randomCode() : f.couponCode }))}
                  options={[
                    { value: "automatic", label: "Automatic", sub: "Applies by itself when the cart matches" },
                    { value: "code", label: "Discount code", sub: "Customer types a code at checkout" },
                  ]}
                />
                {form.method === "code" && (
                  <div>
                    <label style={label}>Code *</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="input-field mono"
                        value={form.couponCode}
                        maxLength={20}
                        placeholder="e.g. DIWALI15"
                        onChange={(e) => set("couponCode", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                        style={{ flex: 1, letterSpacing: "0.06em" }}
                      />
                      <button type="button" className="btn-ghost" onClick={() => set("couponCode", randomCode())}>
                        Generate
                      </button>
                    </div>
                    <p style={hint}>3–20 letters or numbers. Customers can type it in any case.</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {(lvl === "product" || lvl === "cart") && (
            <Card title="Discount" icon={<Percent size={17} />}>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, alignItems: "end" }}>
                  <div>
                    <label style={label}>Type</label>
                    <Segmented
                      value={form.kind}
                      onChange={(v) => set("kind", v)}
                      options={[
                        { value: "percent", label: "Percentage" },
                        { value: "flat", label: "Fixed amount" },
                        { value: "per_item", label: "Per bottle", disabled: lvl !== "cart" },
                      ]}
                    />
                  </div>
                  <div>
                    <label style={label}>{form.kind === "percent" ? "Percent off *" : form.kind === "per_item" ? "₹ off each bottle *" : "₹ off *"}</label>
                    {num("value", { unit: form.kind === "percent" ? "%" : "₹", step: form.kind === "percent" ? 1 : 0.5 })}
                  </div>
                </div>
                {lvl === "cart" && form.kind === "percent" && (
                  <div style={{ maxWidth: 240 }}>
                    <label style={label}>Maximum discount</label>
                    {num("maxDiscount", { unit: "₹", placeholder: "No cap" })}
                    <p style={hint}>Most this offer can take off one order. Empty = no cap.</p>
                  </div>
                )}
                {productScope("Products")}
                {lvl === "cart" && conditions}
              </div>
            </Card>
          )}

          {lvl === "bxgy" && (
            <>
              <Card title="Customer buys" icon={<ListChecks size={17} />}>
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ maxWidth: 200 }}>
                    <label style={label}>Bottles to buy *</label>
                    {num("buyQty", { min: 1, max: 20 })}
                  </div>
                  {productScope("From")}
                </div>
              </Card>
              <Card title="Customer gets" icon={<Gift size={17} />}>
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "end" }}>
                    <div>
                      <label style={label}>Bottles they get *</label>
                      {num("getQty", { min: 1, max: 20 })}
                    </div>
                    <div>
                      <label style={label}>At</label>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <Radios name="getKind" value={form.getKind} onChange={(v) => set("getKind", v)} options={[{ value: "free", label: "Free" }, { value: "percent", label: "Percentage off" }]} />
                        {form.getKind === "percent" && num("getValue", { unit: "%", min: 1, max: 99, width: 110 })}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label style={label}>Which bottles</label>
                    <div style={{ marginBottom: 8 }}>
                      <Radios
                        name="getAppliesTo"
                        value={form.getAppliesTo}
                        onChange={(v) => set("getAppliesTo", v)}
                        options={[{ value: "same", label: "The cheapest of the bottles above" }, { value: "selected", label: "Only selected products" }]}
                      />
                    </div>
                    {form.getAppliesTo === "selected" && <ProductPicker products={products} selected={form.getProductIds} onChange={(v) => set("getProductIds", v)} />}
                    <p style={hint}>The cheapest qualifying bottles are always the free ones, so nobody gets the most expensive bottle free.</p>
                  </div>
                  {conditions}
                </div>
              </Card>
            </>
          )}

          {lvl === "gift" && (
            <Card title="Free gift" icon={<Gift size={17} />}>
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <label style={label}>Gift product *</label>
                  <ProductPicker single products={products} selected={form.giftProductId ? [form.giftProductId] : []} onChange={(v) => set("giftProductId", v[0] || "")} />
                  <p style={hint}>One bottle is added to the order at ₹0.</p>
                </div>
                {conditions}
              </div>
            </Card>
          )}

          {lvl === "shipping" && (
            <Card title="Free delivery" icon={<Truck size={17} />}>
              <div style={{ display: "grid", gap: 12 }}>
                {conditions}
                <p style={hint}>Only makes a difference when the store charges for delivery (Settings → Checkout).</p>
              </div>
            </Card>
          )}

          {isOrder && (
            <Card title="Who can use it" icon={<Users size={17} />}>
              <div style={{ display: "grid", gap: 14 }}>
                <Radios
                  name="eligibility"
                  value={form.eligibility}
                  onChange={(v) => set("eligibility", v)}
                  options={[
                    { value: "everyone", label: "Everyone" },
                    { value: "first_order", label: "First order only" },
                  ]}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
                  <div>
                    <label style={label}>Total uses</label>
                    {num("usageLimit", { placeholder: "No limit" })}
                    <p style={hint}>Stops after this many orders. Empty = no limit.</p>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 26 }}>
                    <Switch id="offer-once" checked={form.oncePerCustomer} onChange={(v) => set("oncePerCustomer", v)} />
                    <label htmlFor="offer-once" style={{ fontSize: 14, cursor: "pointer" }}>
                      Once per customer
                    </label>
                  </div>
                </div>
                <p style={{ ...hint, marginTop: 0 }}>The store checks these when the order is placed (by phone number and email).</p>
              </div>
            </Card>
          )}

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
            {lvl !== "gift" && lvl !== "shipping" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <label htmlFor="offer-combine" style={{ fontWeight: 600, cursor: "pointer" }}>
                    Combine with other offers
                  </label>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Off = when this applies, other {isOrder ? "order" : "product"} offers don&apos;t.</div>
                </div>
                <Switch id="offer-combine" checked={form.combinable} onChange={(v) => set("combinable", v)} />
              </div>
            )}
            <div>
              <label style={label}>Order</label>
              {num("sequence", { min: 0, max: 999, width: 90 })}
              <p style={hint}>Lower runs first. Each offer applies to the price left by the one before.</p>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, background: "var(--bg-hover)", borderRadius: 10, marginBottom: 12 }}>
              <div style={{ background: "#B33D14", color: "#fff", borderRadius: 8, padding: "8px 10px", textAlign: "center", minWidth: 64 }}>
                <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1 }}>{chip.big}</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", marginTop: 3 }}>{chip.small}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B33D14", textTransform: "uppercase" }}>{form.badge || form.name || "Offer name"}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{form.title || form.name || "Headline"}</div>
                {form.message && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{form.message}</div>}
              </div>
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Summary</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              {summaryLines(draft, products).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Calculator size={16} style={{ color: "var(--text-muted)" }} />
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Price preview</h3>
            </div>
            {lvl === "product" ? (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                <span>{preview.sample.name}</span>
                <span>
                  {inr(preview.without.price)} → <b>{inr(preview.withIt.price)}</b>
                </span>
              </div>
            ) : null}
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 0", textAlign: "left" }}>Test cart</th>
                  <th style={{ padding: "6px 0", textAlign: "right" }}>Without</th>
                  <th style={{ padding: "6px 0", textAlign: "right" }}>With this</th>
                </tr>
              </thead>
              <tbody>
                {preview.carts.map((c) => (
                  <tr key={c.qty}>
                    <td style={{ padding: "6px 0" }}>
                      <div>{c.qty} {c.qty === 1 ? "bottle" : "bottles"}</div>
                      {(c.gift || c.ship) && <div style={{ fontSize: 11, color: "var(--accent-emerald)" }}>{c.gift ? `+ free ${giftName || "gift"}` : "Free delivery"}</div>}
                    </td>
                    <td style={{ padding: "6px 0", textAlign: "right" }}>{inr(c.before)}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: c.after < c.before || c.gift || c.ship ? "var(--accent-emerald)" : undefined }}>{inr(c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...hint, marginTop: 10 }}>
              Test carts use {preview.carts.length && preview.carts[preview.carts.length - 1].names.length > 1 ? "different bottles" : preview.sample.name}
              {draft.couponCode ? `, with code ${draft.couponCode} entered` : ""}
              {draft.eligibility === "first_order" ? ", as a first order" : ""}. Together with{" "}
              {preview.othersLive.length ? preview.othersLive.map((o) => o.name).join(", ") : "no other offers"}.
            </p>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <button
              className="btn-primary"
              onClick={() => (isProd ? setConfirmLive(true) : doSave())}
              disabled={saving || deleting || (!dirty && !!offerId)}
              style={{ width: "100%", padding: "10px 14px" }}
            >
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
