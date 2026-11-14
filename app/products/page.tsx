"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import { useToast } from "@/components/Toast";
import { imageSrc } from "@/components/products/ImageManager";
import { Plus, Search, X, RefreshCw, Lock, Package, ImageOff } from "lucide-react";

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const LOW_STOCK = 10;

function Cover({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = { width: 44, height: 44, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-hover)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" };
  if (!src || broken) return <div style={box}><ImageOff size={16} /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <div style={box}><img src={imageSrc(src)} alt={name} onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>;
}

function ProductsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast, showToast } = useToast();
  const [data, setData] = useState<{ products: any[]; writable: boolean; uploadsEnabled: boolean; env: string; table: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "visible" | "hidden" | "low">("all");
  const [category, setCategory] = useState("all");

  async function fetchProducts() {
    const d = await (await fetch("/api/products")).json();
    if (!d.success) throw new Error(d.error || "Failed to load products");
    return d;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchProducts());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    fetchProducts()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    const deleted = params.get("deleted");
    if (deleted) {
      showToast(`Deleted ${deleted}`);
      router.replace("/products");
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const products = useMemo(() => data?.products || [], [data]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[], [products]);
  const stockOf = (p: any) => p.variants.reduce((s: number, v: any) => s + (v.status ? v.stock : 0), 0);
  const isLow = (p: any) => p.variants.some((v: any) => v.status && v.stock <= LOW_STOCK);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (tab === "visible" && !p.status) return false;
      if (tab === "hidden" && p.status) return false;
      if (tab === "low" && !isLow(p)) return false;
      if (!s) return true;
      return [p.name, p.slug, p.category, ...p.variants.map((v: any) => v.sku)].join(" ").toLowerCase().includes(s);
    });
  }, [products, search, tab, category]);

  const counts = {
    all: products.length,
    visible: products.filter((p) => p.status).length,
    hidden: products.filter((p) => !p.status).length,
    low: products.filter(isLow).length,
  };

  return (
    <AdminLayout
      title="Products"
      subtitle={data ? `${data.env === "prod" ? "Live" : "Stage"} catalogue · ${data.table}` : "Catalogue"}
      action={
        <>
          <button className="btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} /> Refresh
          </button>
          {data?.writable && (
            <Link href="/products/new" className="btn-primary" style={{ textDecoration: "none" }}>
              <Plus size={15} /> Add product
            </Link>
          )}
        </>
      }
    >
      {data && !data.writable && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
          <Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Products are read-only on Live. Add and edit products in the stage admin (APP_ENV=stage); the live catalogue is never changed from here.</span>
        </div>
      )}
      {data?.writable && !data.uploadsEnabled && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "#b54708" }}>
          <ImageOff size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Image upload is off until an S3 bucket is set (S3_BUCKET_NAME). You can still edit products and use existing image paths.</span>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="tabs" role="tablist">
          {(
            [
              ["all", "All"],
              ["visible", "Visible"],
              ["hidden", "Hidden"],
              ["low", "Low stock"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
              {l} {!loading && <span className="tab-count">{counts[k]}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input className="input-field" placeholder="Search by name, slug or SKU" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", paddingLeft: 34 }} />
            {search && (
              <button aria-label="Clear search" onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                <X size={14} />
              </button>
            )}
          </div>
          <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {loading && <LoadingState message="Loading products…" />}
        {error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Sizes</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ textAlign: "right" }}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "56px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                      <Package size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                      <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>No products found</div>
                    </td>
                  </tr>
                )}
                {filtered.map((p) => {
                  const visible = p.variants.filter((v: any) => v.status);
                  const prices = visible.map((v: any) => v.price);
                  const min = prices.length ? Math.min(...prices) : null;
                  const max = prices.length ? Math.max(...prices) : null;
                  const stock = stockOf(p);
                  return (
                    <tr key={p.id} onClick={() => router.push(`/products/${p.id}`)} style={{ cursor: "pointer" }}>
                      <td>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <Cover src={p.images[0]} name={p.name} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {p.images.length} image{p.images.length === 1 ? "" : "s"} · /{p.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{p.status ? <span className="badge badge-success">Visible</span> : <span className="badge badge-neutral">Hidden</span>}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{p.category || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {p.variants.map((v: any) => (
                            <span key={v.id} style={{ fontSize: 12, padding: "1px 7px", borderRadius: 6, border: "1px solid var(--border)", color: v.status ? "var(--text-secondary)" : "var(--text-muted)", textDecoration: v.status ? "none" : "line-through" }}>
                              {v.size}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="mono" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{min == null ? "—" : min === max ? inr(min) : `${inr(min)} – ${inr(max!)}`}</td>
                      <td className="mono" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {stock === 0 ? <span className="badge badge-error">Out of stock</span> : isLow(p) ? <span className="badge badge-warning">{stock} · low</span> : stock}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {toast}
    </AdminLayout>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsInner />
    </Suspense>
  );
}
