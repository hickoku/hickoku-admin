"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import ProductForm, { fromProduct } from "@/components/products/ProductForm";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ product: any; writable: boolean; uploadsEnabled: boolean; categories: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch(`/api/products/${encodeURIComponent(id)}`).then((r) => r.json()), fetch("/api/products").then((r) => r.json())])
      .then(([one, all]) => {
        if (!one.success) throw new Error(one.error);
        if (!all.success) throw new Error(all.error);
        setData({
          product: one.product,
          writable: all.writable,
          uploadsEnabled: all.uploadsEnabled,
          categories: [...new Set<string>(all.products.map((p: any) => p.category).filter(Boolean))],
        });
      })
      .catch((e) => setError(e.message || "Failed to load product"));
  }, [id]);

  const p = data?.product;
  return (
    <AdminLayout
      title={p ? p.name : "Product"}
      back={{ href: "/products", label: "Products" }}
      badges={p ? <span className={`badge ${p.status ? "badge-success" : "badge-neutral"}`}>{p.status ? "Visible" : "Hidden"}</span> : undefined}
      subtitle={p ? `ID ${p.id} · /product/${p.slug}` : undefined}
    >
      {error && <ErrorState message={error} />}
      {!data && !error && <LoadingState message="Loading product…" />}
      {data && <ProductForm key={p.id} initial={fromProduct(p)} productId={p.id} writable={data.writable} uploadsEnabled={data.uploadsEnabled} categories={data.categories} />}
    </AdminLayout>
  );
}
