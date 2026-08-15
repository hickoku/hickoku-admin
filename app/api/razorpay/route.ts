import { NextResponse } from "next/server";
import { razorpayFetch } from "@/lib/razorpay";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "orders";
  const id = searchParams.get("id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    if (type === "payment" && id) {
      const payment = await razorpayFetch(`/payments/${id}`);
      return NextResponse.json({ success: true, payment });
    }

    if (type === "order_payments" && id) {
      const payments = await razorpayFetch(`/orders/${id}/payments`);
      return NextResponse.json({ success: true, ...payments });
    }

    if (type === "payments") {
      let query = "/payments?count=100&expand[]=card&expand[]=emi";
      if (from) query += `&from=${from}`;
      if (to) query += `&to=${to}`;
      const data = await razorpayFetch(query);
      return NextResponse.json({ success: true, ...data });
    }

    // Default: orders with payment summaries
    let query = "/orders?count=100&expand[]=payments";
    if (from) query += `&from=${from}`;
    if (to) query += `&to=${to}`;

    const data = await razorpayFetch(query);

    const orders = (data.items || []).map((order: any) => {
      const payments = order.payments?.items || [];
      const totalPaid = payments
        .filter((p: any) => p.status === "captured")
        .reduce((sum: number, p: any) => sum + p.amount, 0);
      return {
        ...order,
        payments_summary: {
          count: payments.length,
          total_paid: totalPaid,
          statuses: payments.map((p: any) => p.status),
          methods: [...new Set(payments.map((p: any) => p.method))],
        },
      };
    });

    return NextResponse.json({ success: true, orders, count: data.count });
  } catch (error: any) {
    console.error("Razorpay error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch Razorpay data" },
      { status: 500 },
    );
  }
}
