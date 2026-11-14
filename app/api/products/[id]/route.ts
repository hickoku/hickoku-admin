import { NextResponse, type NextRequest } from "next/server";
import { getProduct, saveProduct, deleteProduct } from "@/lib/products";

type Ctx = RouteContext<"/api/products/[id]">;

function fail(r: { error: string; status: number }) {
  return NextResponse.json({ success: false, error: r.error }, { status: r.status });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const r = await getProduct((await ctx.params).id);
    return r.success ? NextResponse.json({ success: true, product: r.product }) : fail(r);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to load product" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const r = await saveProduct(await request.json(), (await ctx.params).id);
    return r.success ? NextResponse.json({ success: true, product: r.product }) : fail(r);
  } catch (error: any) {
    console.error("Product update error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to save product" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const r = await deleteProduct((await ctx.params).id);
    return r.success ? NextResponse.json({ success: true, id: r.id, variantsDeleted: r.variantsDeleted }) : fail(r);
  } catch (error: any) {
    console.error("Product delete error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to delete product" }, { status: 500 });
  }
}
