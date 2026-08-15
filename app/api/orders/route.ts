import { NextResponse } from "next/server";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE, PRODUCTS_TABLE } from "@/lib/aws";
import { cancelOrder } from "@/lib/orderActions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const limit = parseInt(searchParams.get("limit") || "200");

  try {
    let ordersResult: any = { Items: [] };

    if (orderId) {
      ordersResult = await docClient.send(
        new ScanCommand({
          TableName: ORDERS_TABLE,
          FilterExpression: "orderId = :oid OR razorpayOrderId = :oid OR orderNumber = :oid",
          ExpressionAttributeValues: { ":oid": orderId },
        }),
      );
    } else {
      ordersResult = await docClient.send(new ScanCommand({ TableName: ORDERS_TABLE, Limit: limit }));
    }

    const orders = ordersResult.Items || [];

    // Enrich with product data. Most orders already embed the line items
    // they were placed with (order.items — name/price/qty/sku/image, price
    // in plain rupees). Only fall back to a PRODUCTS_TABLE lookup for older
    // orders that instead stored bare product_id(s).
    const enrichedOrders = await Promise.all(
      orders.map(async (order: any) => {
        const enriched: any = { ...order, products: [] };

        if (Array.isArray(order.items) && order.items.length) {
          enriched.products = order.items.map((it: any) => ({
            name: it.productName || it.name || it.title,
            price: it.price,
            quantity: it.quantity,
            sku: it.sku,
            image: it.image,
            total: it.total,
          }));
          return enriched;
        }

        const ids: string[] = Array.isArray(order.product_ids)
          ? order.product_ids
          : order.product_id
            ? [order.product_id]
            : [];

        if (ids.length) {
          const products = await Promise.all(
            ids.map(async (productId: string) => {
              try {
                const res = await docClient.send(new GetCommand({ TableName: PRODUCTS_TABLE, Key: { id: productId } }));
                return res.Item || null;
              } catch {
                return null;
              }
            }),
          );
          enriched.products = products.filter(Boolean);
        }

        return enriched;
      }),
    );

    return NextResponse.json({
      success: true,
      orders: enrichedOrders,
      count: enrichedOrders.length,
      tables: { orders: ORDERS_TABLE, products: PRODUCTS_TABLE },
    });
  } catch (error: any) {
    console.error("DynamoDB Orders error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch orders from DynamoDB" },
      { status: 500 },
    );
  }
}

// Cancels an order — but only ones created through /orders/create
// (manuallyCreated: true). Real storefront orders can never be touched here,
// even if called directly. The DynamoDB record is KEPT, not deleted — its
// status is set to "cancelled" so it stays visible/auditable in the Orders
// list. If the order has an AWB, this first cancels the actual Delhivery
// shipment (verified working against the live API — POST /api/p/edit).
// Pass force:true in the body to mark it cancelled anyway even if Delhivery
// rejects the cancellation (e.g. the package was already picked up/delivered).
//
// The actual logic lives in lib/orderActions.ts (cancelOrder) so the same
// code path can be reused by the automated Amazon order sync.
export async function PUT(request: Request) {
  try {
    const { id, force } = await request.json();
    const result = await cancelOrder(id, force);

    if (!result.success) {
      const body: any = { success: false, error: result.error };
      if (result.status === 409) body.delhiveryCancelFailed = true;
      return NextResponse.json(body, { status: result.status });
    }

    return NextResponse.json({ success: true, delhivery: result.delhivery, alreadyCancelled: result.alreadyCancelled });
  } catch (error: any) {
    console.error("DynamoDB order cancel error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to cancel order" },
      { status: 500 },
    );
  }
}
