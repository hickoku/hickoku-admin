import { NextResponse } from "next/server";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE, PRODUCTS_TABLE } from "@/lib/aws";
import { cancelOrder, deleteOrders } from "@/lib/orderActions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const limit = parseInt(searchParams.get("limit") || "200");

  try {
    // A single Scan stops after 1 MB, so keep paging until the table is done
    // (or we have `limit` orders). Without this, older orders and orderId
    // lookups silently go missing once the table grows past 1 MB.
    const orders: any[] = [];
    let startKey: Record<string, any> | undefined;
    do {
      const page: any = await docClient.send(
        new ScanCommand({
          TableName: ORDERS_TABLE,
          ExclusiveStartKey: startKey,
          ...(orderId
            ? {
                FilterExpression: "orderId = :oid OR razorpayOrderId = :oid OR orderNumber = :oid",
                ExpressionAttributeValues: { ":oid": orderId },
              }
            : {}),
        }),
      );
      orders.push(...(page.Items || []));
      startKey = page.LastEvaluatedKey;
    } while (startKey && orders.length < limit);
    orders.splice(limit);

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

// Bulk delete: body { ids: string[] }. Used by the Orders list's multi-select
// and the edit page. The UI confirms once (warning about storefront orders
// and active shipments) before calling this.
export async function DELETE(request: Request) {
  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || !ids.length) {
      return NextResponse.json({ success: false, error: "No orders selected" }, { status: 400 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ success: false, error: "Delete at most 200 orders at a time" }, { status: 400 });
    }
    const result = await deleteOrders(ids);
    return NextResponse.json({ success: result.failed.length === 0, ...result });
  } catch (error: any) {
    console.error("Bulk order delete error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to delete orders" }, { status: 500 });
  }
}
