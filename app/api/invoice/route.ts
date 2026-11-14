import { NextResponse } from "next/server";
import { getInvoiceData, getPreviewInvoice } from "@/lib/invoice";
import { defaultSettings } from "@/lib/settings";
import { renderInvoiceHTML } from "@/lib/invoiceTemplate";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const format = searchParams.get("format") || "html";

  // Sample invoice using the saved settings (Settings page "Preview").
  if (searchParams.get("preview") === "1") {
    return new Response(renderInvoiceHTML(await getPreviewInvoice()), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

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

// Preview with unsaved form values: the Settings page posts its current form
// here (as a hidden form field) and the sample invoice opens in a new tab.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const raw = JSON.parse(String(form.get("settings") || "{}"));
    const d = defaultSettings();
    const settings = {
      seller: { ...d.seller, ...(raw.seller || {}) },
      invoice: { ...d.invoice, ...(raw.invoice || {}), show: { ...d.invoice.show, ...(raw.invoice?.show || {}) } },
    };
    return new Response(renderInvoiceHTML(await getPreviewInvoice(settings)), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to render preview" }, { status: 400 });
  }
}
