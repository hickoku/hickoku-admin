"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import OfferForm, { emptyOffer, type OfferProduct } from "@/components/offers/OfferForm";
import type { Offer } from "@/lib/offerEngine";

export default function NewOfferPage() {
  const [data, setData] = useState<{ offers: Offer[]; products: OfferProduct[]; env: string; typesLive: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/offers")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message || "Failed to load"));
  }, []);

  const nextSeq = data ? Math.max(0, ...data.offers.map((o) => o.sequence)) + 1 : 1;
  return (
    <AdminLayout title="New offer" back={{ href: "/offers", label: "Offers" }}>
      {error && <ErrorState message={error} />}
      {!data && !error && <LoadingState message="Loading…" />}
      {data && <OfferForm initial={emptyOffer(nextSeq)} otherOffers={data.offers} products={data.products} isProd={data.env === "prod"} typesLive={data.typesLive} />}
    </AdminLayout>
  );
}
