import { NextResponse, type NextRequest } from "next/server";
import { getOffer, saveOffer, setOfferEnabled, deleteOffer } from "@/lib/offers";

type Ctx = RouteContext<"/api/offers/[id]">;

function fail(r: { error: string; status: number }) {
  return NextResponse.json({ success: false, error: r.error }, { status: r.status });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const r = await getOffer((await ctx.params).id);
    return r.success ? NextResponse.json({ success: true, offer: r.offer }) : fail(r);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to load offer" }, { status: 500 });
  }
}

// PUT: full save. PATCH { enabled }: quick on/off switch from the list.
export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const r = await saveOffer(await request.json(), (await ctx.params).id);
    return r.success ? NextResponse.json({ success: true, offer: r.offer }) : fail(r);
  } catch (error: any) {
    console.error("Offer update error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to save offer" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { enabled } = await request.json();
    if (typeof enabled !== "boolean") return NextResponse.json({ success: false, error: "enabled must be true or false" }, { status: 400 });
    const r = await setOfferEnabled((await ctx.params).id, enabled);
    return r.success ? NextResponse.json({ success: true, offer: r.offer }) : fail(r);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to update offer" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const r = await deleteOffer((await ctx.params).id);
    return r.success ? NextResponse.json({ success: true, id: r.id }) : fail(r);
  } catch (error: any) {
    console.error("Offer delete error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to delete offer" }, { status: 500 });
  }
}
