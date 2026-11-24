import { NextResponse } from "next/server";
import { listOffers, saveOffer, offerTypesLive } from "@/lib/offers";
import { listProducts } from "@/lib/products";
import { OFFERS_TABLE } from "@/lib/aws";
import { APP_ENV } from "@/lib/env";

// GET: all offers plus a light product list (for the "applies to" picker and preview prices).
export async function GET() {
  try {
    const [offers, products] = await Promise.all([listOffers(), listProducts()]);
    return NextResponse.json({
      success: true,
      offers,
      products: products.map((p) => ({ id: p.id, name: p.name, image: p.images[0] || null, price: p.variants.find((v) => v.status)?.price ?? p.variants[0]?.price ?? 0 })),
      env: APP_ENV,
      table: OFFERS_TABLE,
      // false until the storefront for this environment supports the new offer types
      typesLive: offerTypesLive(),
    });
  } catch (error: any) {
    console.error("Offers list error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to load offers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const r = await saveOffer(await request.json());
    if (!r.success) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, offer: r.offer });
  } catch (error: any) {
    console.error("Offer create error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to create offer" }, { status: 500 });
  }
}
