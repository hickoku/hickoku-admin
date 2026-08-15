import { NextResponse } from "next/server";
import { getInvoiceData } from "@/lib/invoice";
import { renderInvoiceHTML } from "@/lib/invoiceTemplate";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const format = searchParams.get("format") || "html";

  if (!orderId) {
    return NextResponse.json({ success: false, error: "orderId is required" }, { status: 400 });
  }

  try {
    const invoice = await getInvoiceData(orderId);
    if (!invoice) {
      return NextResponse.json({ success: false, error: `No order found with ID: ${orderId}` }, { status: 404 });
    }

    if (format === "json") {
      return NextResponse.json({ success: true, invoice });
    }

    return new Response(renderInvoiceHTML(invoice), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Invoice generation error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to generate invoice" }, { status: 500 });
  }
}
