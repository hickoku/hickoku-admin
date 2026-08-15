import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const base = new URL(request.url).origin;

  try {
    const [razorpayRes, ordersRes] = await Promise.allSettled([
      fetch(`${base}/api/razorpay?type=orders`, { headers: request.headers }),
      fetch(`${base}/api/orders?limit=500`, { headers: request.headers }),
    ]);

    let rzOrders: any[] = [];
    let shipments: any[] = [];
    let dbOrders: any[] = [];

    if (razorpayRes.status === "fulfilled" && razorpayRes.value.ok) {
      const d = await razorpayRes.value.json();
      rzOrders = d.orders || [];
    }
    if (ordersRes.status === "fulfilled" && ordersRes.value.ok) {
      const d = await ordersRes.value.json();
      dbOrders = d.orders || [];
    }

    // Delhivery can't list "all shipments" — batch-fetch just the AWBs
    // already stored on orders.
    const awbs = [...new Set(dbOrders.map((o: any) => o.awb).filter(Boolean))];
    if (awbs.length) {
      const delhiveryRes = await fetch(`${base}/api/delhivery?waybills=${encodeURIComponent(awbs.join(","))}`, {
        headers: request.headers,
      });
      if (delhiveryRes.ok) shipments = (await delhiveryRes.json()).shipments || [];
    }

    const paidOrders = rzOrders.filter((o: any) => o.status === "paid");
    const totalRevenue = paidOrders.reduce((s: number, o: any) => s + (o.amount_paid || 0), 0);

    // Revenue trend for the last 14 days
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    paidOrders.forEach((o: any) => {
      const day = new Date(o.created_at * 1000).toISOString().slice(0, 10);
      if (day in days) days[day] += o.amount_paid / 100;
    });
    const revenueTrend = Object.entries(days).map(([date, revenue]) => ({ date, revenue }));

    // Order status breakdown
    const statusCounts: Record<string, number> = {};
    rzOrders.forEach((o: any) => {
      const s = o.status || "unknown";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    // Shipment status breakdown
    const shipmentStatusCounts: Record<string, number> = {};
    shipments.forEach((s: any) => {
      const status = s.status || "Unknown";
      shipmentStatusCounts[status] = (shipmentStatusCounts[status] || 0) + 1;
    });

    // Top products by units sold (from DynamoDB orders)
    const productSales: Record<string, { name: string; units: number; revenue: number }> = {};
    dbOrders.forEach((o: any) => {
      (o.products || []).forEach((p: any) => {
        const key = p.id || p.name || p.product_name || p.title || "unknown";
        const name = p.name || p.product_name || p.title || key;
        if (!productSales[key]) productSales[key] = { name, units: 0, revenue: 0 };
        productSales[key].units += p.quantity || 1;
        productSales[key].revenue += p.total ?? (p.price || p.unit_price || 0) * (p.quantity || 1);
      });
    });
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.units - a.units)
      .slice(0, 6);

    return NextResponse.json({
      success: true,
      stats: {
        revenue: { total: totalRevenue, trend: revenueTrend },
        orders: { total: rzOrders.length, paid: paidOrders.length, statusBreakdown: statusCounts },
        shipments: { total: shipments.length, statusBreakdown: shipmentStatusCounts },
        topProducts,
        recentOrders: dbOrders
          .slice()
          .sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())
          .slice(0, 6),
      },
    });
  } catch (error: any) {
    console.error("Dashboard aggregation error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
