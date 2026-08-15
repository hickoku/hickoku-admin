import { NextResponse } from "next/server";
import { createManualOrder } from "@/lib/orderActions";

// Books a real Delhivery pickup and writes the resulting order to DynamoDB.
// Used for orders that never go through the storefront checkout — Amazon,
// influencer/marketing sends, replacements, etc. — so they still show up
// and get tracked in the admin panel like any other order.
//
// The actual logic lives in lib/orderActions.ts (createManualOrder) so the
// same code path can be reused by the automated Amazon order sync.

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createManualOrder(body);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, orderId: result.orderId, waybill: result.waybill, order: result.order });
  } catch (error: any) {
    console.error("Error creating manual order:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to create order" }, { status: 500 });
  }
}
