"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import OfferForm, { fromOffer, fmtIst, type OfferProduct } from "@/components/offers/OfferForm";
import type { Offer } from "@/lib/offerEngine";

export default function EditOfferPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ offer: Offer & { updatedAt?: string }; offers: Offer[]; products: OfferProduct[]; env: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch(`/api/offers/${encodeURIComponent(id)}`).then((r) => r.json()), fetch("/api/offers").then((r) => r.json())])
      .then(([one, all]) => {
        if (!one.success) throw new Error(one.error);
        if (!all.success) throw new Error(all.error);
        setData({ offer: one.offer, offers: all.offers, products: all.products, env: all.env });
      })
      .catch((e) => setError(e.message || "Failed to load offer"));
  }, [id]);

  const o = data?.offer;
  return (
    <AdminLayout
      title={o ? o.name : "Offer"}
      back={{ href: "/offers", label: "Offers" }}
      subtitle={o?.updatedAt ? `Last saved ${fmtIst(o.updatedAt)} IST` : undefined}
    >
      {error && <ErrorState message={error} />}
      {!data && !error && <LoadingState message="Loading offer…" />}
      {data && o && <OfferForm key={o.id} initial={fromOffer(o)} offerId={o.id} otherOffers={data.offers} products={data.products} isProd={data.env === "prod"} />}
    </AdminLayout>
  );
}
