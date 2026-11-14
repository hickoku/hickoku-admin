"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import ProductForm, { emptyVariant } from "@/components/products/ProductForm";

export default function NewProductPage() {
  const [meta, setMeta] = useState<{ writable: boolean; uploadsEnabled: boolean; categories: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setMeta({ writable: d.writable, uploadsEnabled: d.uploadsEnabled, categories: [...new Set<string>(d.products.map((p: any) => p.category).filter(Boolean))] });
      })
      .catch((e) => setError(e.message || "Failed to load"));
  }, []);

  return (
    <AdminLayout title="New product" back={{ href: "/products", label: "Products" }}>
      {error && <ErrorState message={error} />}
      {!meta && !error && <LoadingState message="Loading…" />}
      {meta && !meta.writable && <ErrorState message="Products are read-only on Live. Create products in the stage admin." />}
      {meta?.writable && (
        <ProductForm
          initial={{ name: "", slug: "", category: "", badge: "", highlight: "", description: "", images: [], status: false, variants: [emptyVariant()] }}
          writable
          uploadsEnabled={meta.uploadsEnabled}
          categories={meta.categories}
        />
      )}
    </AdminLayout>
  );
}
