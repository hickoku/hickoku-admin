import { NextResponse, type NextRequest } from "next/server";
import { getOrder, updateOrder, deleteOrder } from "@/lib/orderActions";

// Single-order CRUD. The logic and its safety rules live in
// lib/orderActions.ts. DELETE takes ?force=1 to delete an order whose
// shipment is still active.

function fail(result: { error: string; status: number }) {
  return NextResponse.json({ success: false, error: result.error }, { status: result.status });
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  try {
    const { id } = await ctx.params;
    const result = await getOrder(decodeURIComponent(id));
    if (!result.success) return fail(result);
    return NextResponse.json({ success: true, order: result.order });
  } catch (error: any) {
    console.error("Order fetch error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch order" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const result = await updateOrder(decodeURIComponent(id), body);
    if (!result.success) return fail(result);
    return NextResponse.json({ success: true, order: result.order });
  } catch (error: any) {
    console.error("Order update error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  try {
    const { id } = await ctx.params;
    const force = request.nextUrl.searchParams.get("force") === "1";
    const result = await deleteOrder(decodeURIComponent(id), force);
    if (!result.success) {
      if (result.status === 409) {
        return NextResponse.json({ success: false, error: result.error, activeShipment: true }, { status: 409 });
      }
      return fail(result);
    }
    return NextResponse.json({ success: true, orderId: result.orderId });
  } catch (error: any) {
    console.error("Order delete error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to delete order" }, { status: 500 });
  }
}
