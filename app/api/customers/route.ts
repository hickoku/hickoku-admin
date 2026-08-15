import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE } from "@/lib/aws";

// Groups orders into distinct customers. There's no separate customers
// table — customers only exist as fields embedded on each order — so this
// scans the orders table and dedupes by phone number (always present,
// unlike email which Amazon orders omit). Falls back to email, then to a
// per-order key for the rare order with neither.
function normalizePhone(phone?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10); // last 10 digits — strips +91/country code/spaces/dashes
}

export async function GET() {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: ORDERS_TABLE }));
    const orders = result.Items || [];

    const customers = new Map<string, any>();

    for (const order of orders) {
      const phone = order.customerPhone || order.phone || order.shippingAddress?.phone || "";
      const email = (order.customerEmail || order.email || order.shippingAddress?.email || "").toLowerCase();
      const normPhone = normalizePhone(phone);
      const key = normPhone || email || `order-${order.orderId || order.id}`;

      const name =
        (order.customerFirstName ? `${order.customerFirstName} ${order.customerLastName || ""}`.trim() : order.customer_name || order.name) ||
        "—";

      const addr = order.shippingAddress;
      const addressStr = addr ? [addr.street, addr.city, addr.state, addr.zipCode].filter(Boolean).join(", ") : "";
      const createdAt = order.createdAt || order.created_at || null;
      const source = order.source || "storefront";
      const isCancelled = order.status === "cancelled";

      if (!customers.has(key)) {
        customers.set(key, {
          id: key,
          name,
          email: email || null,
          phone: phone || null,
          addresses: new Set<string>(),
          sources: new Set<string>(),
          orderCount: 0,
          cancelledCount: 0,
          totalSpent: 0,
          firstOrderAt: createdAt,
          lastOrderAt: createdAt,
          orders: [],
        });
      }

      const c = customers.get(key);
      // Prefer the most complete/most recent name & email — later orders overwrite if they add info this one lacked.
      if (name && name !== "—") c.name = name;
      if (email && !c.email) c.email = email;
      if (phone && !c.phone) c.phone = phone;
      if (addressStr) c.addresses.add(addressStr);
      c.sources.add(source);
      c.orderCount += 1;
      if (isCancelled) c.cancelledCount += 1;
      else c.totalSpent += typeof order.total === "number" ? order.total : 0;

      if (createdAt && (!c.firstOrderAt || createdAt < c.firstOrderAt)) c.firstOrderAt = createdAt;
      if (createdAt && (!c.lastOrderAt || createdAt > c.lastOrderAt)) c.lastOrderAt = createdAt;

      c.orders.push({
        orderId: order.orderId || order.id,
        orderNumber: order.orderNumber,
        createdAt,
        status: order.status,
        total: order.total,
        source,
      });
    }

    const list = Array.from(customers.values())
      .map((c) => ({
        ...c,
        addresses: Array.from(c.addresses),
        sources: Array.from(c.sources),
        orders: c.orders.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
      }))
      .sort((a, b) => new Date(b.lastOrderAt || 0).getTime() - new Date(a.lastOrderAt || 0).getTime());

    return NextResponse.json({ success: true, customers: list, count: list.length });
  } catch (error: any) {
    console.error("Customers aggregation error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load customers from DynamoDB" },
      { status: 500 },
    );
  }
}
