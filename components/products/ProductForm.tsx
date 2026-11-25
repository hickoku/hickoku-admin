"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import ImageManager, { imageSrc } from "./ImageManager";
import { Plus, Trash2, Save, AlertCircle, Package, Images, Layers, Eye, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { Card, Switch } from "@/components/FormBits";
import { readJson } from "@/lib/readJson";

export type VariantForm = {
  id?: string;
  size: string;
  sku: string;
  price: string;
  stock: string;
  shortDesc: string;
  desc: string;
  characteristics: string;
  status: boolean;
  open?: boolean;
};

export type ProductFormValue = {
  name: string;
  slug: string;
  category: string;
  badge: string;
  highlight: string;
  description: string;
  images: string[];
  status: boolean;
  variants: VariantForm[];
};

export const emptyVariant = (): VariantForm => ({ size: "", sku: "", price: "", stock: "0", shortDesc: "", desc: "", characteristics: "", status: true, open: true });

export function fromProduct(p: any): ProductFormValue {
  return {
    name: p.name,
    slug: p.slug,
    category: p.category,
    badge: p.badge || "",
    highlight: p.highlight || "",
    description: p.description || "",
    images: p.images || [],
    status: p.status !== false,
    variants: (p.variants || []).map((v: any) => ({
      id: v.id,
      size: v.size,
      sku: v.sku,
      price: String(v.price),
      stock: String(v.stock),
      shortDesc: v.shortDesc || "",
      desc: v.desc || "",
      characteristics: (v.characteristics || []).join("\n"),
      status: v.status !== false,
      open: false,
    })),
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const label = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 } as const;
const hint = { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } as const;
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export default function ProductForm({
  initial,
  productId,
  writable,
  uploadsEnabled,
  categories,
}: {
  initial: ProductFormValue;
  productId?: string;
  writable: boolean;
  uploadsEnabled: boolean;
  categories: string[];
}) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [form, setForm] = useState<ProductFormValue>(initial);
  const [slugTouched, setSlugTouched] = useState(!!productId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  // Upload folder for new products, before they have an id.
  const [draftKey] = useState(() => `draft-${Date.now().toString(36)}`);

  const dirty = JSON.stringify(form) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof ProductFormValue>(k: K, v: ProductFormValue[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setVariant = (i: number, patch: Partial<VariantForm>) => setForm((f) => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  const prices = form.variants.filter((v) => v.price !== "").map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n >= 0);
  const fromPrice = prices.length ? Math.min(...prices) : null;
  const totalStock = form.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
  const visibleVariants = form.variants.filter((v) => v.status).length;

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (form.status && !form.images.length) w.push("No images: the product shows without a picture.");
    if (form.status && form.variants.length && !visibleVariants) w.push("All sizes are hidden, so the product can't be bought.");
    if (form.status && form.variants.length && totalStock === 0) w.push("Total stock is 0, so it shows as out of stock.");
    return w;
  }, [form.status, form.images.length, form.variants.length, visibleVariants, totalStock]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...form,
        variants: form.variants.map((v) => ({ ...v, characteristics: v.characteristics.split("\n") })),
      };
      const res = await fetch(productId ? `/api/products/${productId}` : "/api/products", {
        method: productId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Couldn't save");
      const saved = fromProduct(data.product);
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      showToast(productId ? "Product saved" : "Product created");
      if (!productId) router.replace(`/products/${data.product.id}`);
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
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Couldn't delete");
      setBaseline(JSON.stringify(form));
      router.push("/products?deleted=" + encodeURIComponent(form.name));
    } catch (e: any) {
      showToast(e.message, true);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const ro = !writable;
  const input = (k: "name" | "category" | "badge" | "highlight" | "description", extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      className="input-field"
      value={form[k]}
      disabled={ro}
      onChange={(e) => {
        const v = e.target.value;
        setForm((f) => ({ ...f, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(v) } : {}) }));
      }}
      style={{ width: "100%" }}
      {...extra}
    />
  );

  return (
    <>
      {error && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--accent-red-glow)", border: "1px solid #fecdca", color: "#b42318", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
        <div>
          <Card title="Product details" icon={<Package size={18} />}>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={label}>Name *</label>
                {input("name", { placeholder: "e.g. Velvira" })}
              </div>
              <div>
                <label style={label}>URL slug *</label>
                <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border-bright)", borderRadius: 8, overflow: "hidden", background: ro ? "var(--bg-elevated)" : "#fff", boxShadow: "var(--shadow-sm)" }}>
                  <span style={{ padding: "8px 0 8px 12px", color: "var(--text-muted)", fontSize: 13, whiteSpace: "nowrap" }}>hickoku.com/product/</span>
                  <input
                    value={form.slug}
                    disabled={ro}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                    }}
                    style={{ flex: 1, border: "none", outline: "none", padding: "8px 12px 8px 0", fontSize: 14, fontFamily: "var(--font-display)", background: "transparent", color: "var(--text-primary)" }}
                  />
                </div>
                {productId && <p style={hint}>Changing the slug changes the product&apos;s web address; old links stop working.</p>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label}>Category</label>
                  {input("category", { list: "category-options", placeholder: "For Him / For Her" })}
                  <datalist id="category-options">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={label}>Badge</label>
                  {input("badge", { placeholder: "e.g. Bestseller (optional)" })}
                </div>
              </div>
              <div>
                <label style={label}>Tagline</label>
                {input("description", { placeholder: "Short line under the name, e.g. Romantic Floral Attar" })}
              </div>
              <div>
                <label style={label}>Highlight</label>
                {input("highlight", { placeholder: "Optional one-line highlight" })}
              </div>
            </div>
          </Card>

          <Card title={`Images (${form.images.length})`} icon={<Images size={18} />}>
            <ImageManager
              images={form.images}
              onChange={(imgs) => set("images", imgs)}
              productKey={productId || draftKey}
              writable={writable}
              uploadsEnabled={uploadsEnabled}
              productName={form.name || "Product"}
            />
          </Card>

          <Card
            title={`Sizes and pricing (${form.variants.length})`}
            icon={<Layers size={18} />}
            action={
              writable && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => set("variants", [...form.variants, emptyVariant()])}>
                  <Plus size={14} /> Add size
                </button>
              )
            }
          >
            {form.variants.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Add at least one size (e.g. 6ml at ₹249).</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {form.variants.map((v, i) => (
                <div key={v.id || `new-${i}`} style={{ border: "1px solid var(--border)", borderRadius: 10, background: v.status ? "#fff" : "var(--bg-elevated)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 1fr 0.8fr auto", gap: 10, padding: 14, alignItems: "end" }}>
                    <div>
                      <label style={{ ...label, fontSize: 12 }}>Size *</label>
                      <input className="input-field" disabled={ro} value={v.size} placeholder="6ml" onChange={(e) => setVariant(i, { size: e.target.value })} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <label style={{ ...label, fontSize: 12 }}>SKU *</label>
                      <input className="input-field" disabled={ro} value={v.sku} placeholder="VEL-6ML-006" onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase() })} style={{ width: "100%", fontFamily: "var(--font-code)", fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ ...label, fontSize: 12 }}>Price (₹) *</label>
                      <input className="input-field" disabled={ro} type="number" min={0} step="0.01" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} style={{ width: "100%" }} />
                    </div>
                    <div>
                      <label style={{ ...label, fontSize: 12 }}>Stock *</label>
                      <input className="input-field" disabled={ro} type="number" min={0} step={1} value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} style={{ width: "100%" }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
                      <label htmlFor={`v-${i}-status`} style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>{v.status ? "Visible" : "Hidden"}</label>
                      <Switch id={`v-${i}-status`} checked={v.status} disabled={ro} onChange={(s) => setVariant(i, { status: s })} />
                      <button type="button" className="btn-ghost btn-sm" style={{ padding: 6, boxShadow: "none" }} aria-label={v.open ? "Hide description" : "Show description"} title="Description and notes" onClick={() => setVariant(i, { open: !v.open })}>
                        {v.open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      {writable && (
                        <button type="button" className="btn-ghost btn-sm btn-danger-soft" style={{ padding: 6, boxShadow: "none" }} aria-label="Remove size" title="Remove size" onClick={() => set("variants", form.variants.filter((_, j) => j !== i))}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {v.open && (
                    <div style={{ display: "grid", gap: 12, padding: "0 14px 14px", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                      <div>
                        <label style={{ ...label, fontSize: 12 }}>Short description</label>
                        <input className="input-field" disabled={ro} value={v.shortDesc} onChange={(e) => setVariant(i, { shortDesc: e.target.value })} style={{ width: "100%" }} placeholder="One line shown near the price" />
                      </div>
                      <div>
                        <label style={{ ...label, fontSize: 12 }}>Full description</label>
                        <textarea className="input-field" disabled={ro} rows={4} value={v.desc} onChange={(e) => setVariant(i, { desc: e.target.value })} style={{ width: "100%", resize: "vertical" }} />
                      </div>
                      <div>
                        <label style={{ ...label, fontSize: 12 }}>Fragrance notes (one per line)</label>
                        <textarea
                          className="input-field"
                          disabled={ro}
                          rows={3}
                          value={v.characteristics}
                          onChange={(e) => setVariant(i, { characteristics: e.target.value })}
                          style={{ width: "100%", resize: "vertical" }}
                          placeholder={"Floral: Rose, Cherry Blossom\nWoody: Amber Resin, Woods"}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ position: "sticky", top: 24 }}>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>Visible on store</h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{form.status ? "Shown in the shop" : "Hidden from the shop"}</p>
              </div>
              <Switch id="product-status" checked={form.status} disabled={ro} onChange={(s) => set("status", s)} />
            </div>
            {warnings.length > 0 && (
              <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 12, color: "#b54708", lineHeight: 1.5 }}>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Eye size={16} color="var(--text-muted)" />
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Card preview</h2>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", opacity: form.status ? 1 : 0.55 }}>
              <div style={{ position: "relative", aspectRatio: "4 / 5", background: "var(--bg-hover)" }}>
                {form.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageSrc(form.images[0])} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>No cover image</div>
                )}
                {form.badge && <span style={{ position: "absolute", top: 10, left: 10, background: "#101828", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999 }}>{form.badge}</span>}
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{form.category || "Category"}</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{form.name || "Product name"}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{form.description || "Tagline"}</div>
                <div style={{ fontWeight: 600, marginTop: 8 }}>{fromPrice != null ? `${form.variants.length > 1 ? "From " : ""}${inr(fromPrice)}` : "—"}</div>
              </div>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px", fontSize: 13, marginTop: 14 }}>
              <dt style={{ color: "var(--text-muted)" }}>Sizes</dt>
              <dd>
                {visibleVariants} visible{form.variants.length > visibleVariants ? `, ${form.variants.length - visibleVariants} hidden` : ""}
              </dd>
              <dt style={{ color: "var(--text-muted)" }}>Total stock</dt>
              <dd>{totalStock}</dd>
            </dl>
          </div>

          {writable ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn-primary" onClick={save} disabled={saving || deleting || (!dirty && !!productId)} style={{ width: "100%", padding: "10px 14px" }}>
                <Save size={15} /> {saving ? "Saving…" : productId ? (dirty ? "Save changes" : "Saved") : "Create product"}
              </button>
              {productId && (
                <button className="btn-ghost btn-danger-soft" onClick={() => setConfirmDelete(true)} disabled={saving || deleting} style={{ width: "100%" }}>
                  <Trash2 size={14} /> Delete product
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--text-muted)", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)" }}>
              <Lock size={15} style={{ flexShrink: 0, marginTop: 1 }} /> Read-only on Live. Edit products in the stage admin.
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${form.name || "this product"}?`}
        confirmLabel="Delete product"
        busyLabel="Deleting…"
        busy={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
      >
        <p>
          The product and its {form.variants.length} size{form.variants.length === 1 ? "" : "s"} are removed from the stage catalogue. This can&apos;t be undone. Past orders
          keep their own copy of the item details.
        </p>
      </ConfirmDialog>
      {toast}
    </>
  );
}
