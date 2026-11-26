import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE } from "@/lib/aws";
import { razorpayFetch } from "@/lib/razorpay";
import { getStoreSettings, type SellerDetails, type InvoiceSettings, type StoreSettings } from "@/lib/settings";

// Seller identity (the legal entity) and invoice layout come from
// Settings → Store details (lib/settings.ts), falling back to SELLER_* env vars.

export function fmt(n: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

export function toWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (n === 0) return "Zero";
  const convert = (num: number): string => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convert(num % 100) : "");
    if (num < 100000) return convert(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + convert(num % 1000) : "");
    if (num < 10000000) return convert(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + convert(num % 100000) : "");
    return convert(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 ? " " + convert(num % 10000000) : "");
  };
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  return convert(rupees) + " Rupees" + (paise > 0 ? " and " + convert(paise) + " Paise" : "") + " Only";
}

// GST included in a total, worked out the same way as the storefront's admin
// order email (app/emails/AdminOrderNotification.tsx): taxable = total / 1.18,
// GST = total - taxable. Split into CGST + SGST when the buyer is in the
// seller's state, IGST otherwise; no split if either state is unknown.
export type GstBreakdown = {
  rate: number;
  taxable: number;
  amount: number;
  split: "intra" | "inter" | null;
  half: number;
};

const normState = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");

export function computeGst(total: number, rate: number, sellerState: string, buyerState: string): GstBreakdown {
  const taxable = Number((total / (1 + rate / 100)).toFixed(2));
  const amount = Number((total - taxable).toFixed(2));
  const a = normState(sellerState);
  const b = normState(buyerState);
  const split = a && b ? (a === b ? "intra" : "inter") : null;
  return { rate, taxable, amount, split, half: Number((amount / 2).toFixed(2)) };
}

export type InvoiceItem = { name: string; sku?: string; qty: number; unitPrice: number; total: number };

export type InvoiceData = {
  invoiceNo: string;
  invoiceDate: string;
  orderId: string;
  orderNumber: string;
  status: string;
  isCancelled: boolean;
  isTaxInvoice: boolean;
  title: string;
  seller: SellerDetails;
  layout: InvoiceSettings;
  buyer: { name: string; email: string; phone: string; address: string; city: string; state: string; pin: string };
  items: InvoiceItem[];
  subtotal: number | null;
  discount: number | null;
  shipping: number | null;
  tax: number | null;
  total: number;
  amountInWords: string;
  gst: GstBreakdown;
  fees: { handling: number; delivery: number };
  // Delivery fee the customer actually paid (storefront "Charge shipping" on); null = delivery was free
  deliveryCharged: number | null;
  payment: { method: string; status: string; id: string; via: string };
  awb: string | null;
};

// Finds an order by orderId (direct key lookup), else by Razorpay order id or
// order number (scan, paged so it covers the whole table).
async function findOrder(orderId: string): Promise<any | null> {
  const direct = await docClient.send(
    new GetCommand({ TableName: ORDERS_TABLE, Key: { PK: orderId.startsWith("ORDER#") ? orderId : `ORDER#${orderId}`, SK: "METADATA" } }),
  );
  if (direct.Item) return direct.Item;
  let startKey: Record<string, any> | undefined;
  do {
    const page: any = await docClient.send(
      new ScanCommand({
        TableName: ORDERS_TABLE,
        FilterExpression: "orderId = :oid OR razorpayOrderId = :oid OR orderNumber = :oid",
        ExpressionAttributeValues: { ":oid": orderId },
        ExclusiveStartKey: startKey,
      }),
    );
    if (page.Items?.length) return page.Items[0];
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return null;
}

function applySettings(settings: StoreSettings) {
  const { seller, invoice } = settings;
  const isTaxInvoice = Boolean(invoice.show.gstin && seller.gstin);
  return {
    seller,
    layout: invoice,
    isTaxInvoice,
    title: invoice.title || (isTaxInvoice ? "Tax Invoice" : "Invoice"),
  };
}

export async function getInvoiceData(orderId: string): Promise<InvoiceData | null> {
  const [order, { settings }] = await Promise.all([findOrder(orderId), getStoreSettings()]);
  if (!order) return null;
  const s = applySettings(settings);

  const orderDate = new Date(order.createdAt || order.created_at || Date.now());
  const invoiceNo = `${settings.invoice.prefix}-${orderDate.getFullYear()}-${(order.orderNumber || order.orderId || orderId).toString().slice(-8).toUpperCase()}`;

  const shipping = order.shippingAddress || {};
  const buyer = {
    name: (order.customerFirstName ? `${order.customerFirstName} ${order.customerLastName || ""}`.trim() : order.customer_name || shipping.name) || "Customer",
    email: order.customerEmail || shipping.email || "",
    phone: order.customerPhone || shipping.phone || "",
    address: shipping.street || shipping.address || "",
    city: shipping.city || "",
    state: shipping.state || "",
    pin: shipping.zipCode || shipping.pin || "",
  };

  const items: InvoiceItem[] = (Array.isArray(order.items) ? order.items : []).map((it: any) => {
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const unitPrice = Number(it.price ?? it.unitPrice ?? 0);
    return {
      name: it.productName || it.name || "Item",
      sku: it.sku,
      qty,
      unitPrice,
      total: it.total != null ? Number(it.total) : unitPrice * qty,
    };
  });

  // Payment info — Razorpay for storefront orders, "marked paid" for manual ones.
  let payment = { method: "", status: order.paymentStatus || "", id: "", via: "Razorpay" };
  if (order.razorpayOrderId) {
    try {
      const rz = await razorpayFetch(`/orders/${order.razorpayOrderId}/payments`);
      const captured = rz.items?.find((p: any) => p.status === "captured") || rz.items?.[0];
      if (captured) payment = { method: captured.method || "", status: captured.status, id: captured.id, via: "Razorpay" };
    } catch {
      // fine — invoice still renders without live payment detail
    }
  } else if (order.source) {
    payment = { method: "", status: order.paymentStatus || "paid", id: "", via: order.source === "amazon" ? "Amazon" : "Manual" };
  }

  const total = typeof order.total === "number" ? order.total : items.reduce((sum, i) => sum + i.total, 0);
  const deliveryCharged = order.shippingCharged === true && Number(order.shippingCost) > 0 ? Number(order.shippingCost) : null;
  const inv = settings.invoice;
  return {
    invoiceNo,
    invoiceDate: orderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    orderId: order.orderId || orderId,
    orderNumber: order.orderNumber || order.orderId || orderId,
    status: order.status || "",
    isCancelled: order.status === "cancelled",
    ...s,
    buyer,
    items,
    subtotal: typeof order.subtotal === "number" ? order.subtotal : null,
    discount: typeof order.surpriseDiscount === "number" ? order.surpriseDiscount : null,
    shipping: typeof order.shippingCost === "number" ? order.shippingCost : null,
    tax: typeof order.tax === "number" ? order.tax : null,
    total,
    amountInWords: toWords(total),
    // GST is on the items only; a charged delivery fee is its own line
    gst: computeGst(deliveryCharged ? Math.max(0, total - deliveryCharged) : total, inv.gstRate, settings.seller.state, buyer.state),
    deliveryCharged,
    fees: {
      handling: inv.handlingFee,
      delivery: typeof order.shippingCost === "number" && order.shippingCost > 0 ? order.shippingCost : inv.deliveryFee,
    },
    payment,
    awb: order.awb || null,
  };
}

// Sample invoice for the Settings page preview: real settings (saved, or the
// unsaved form values passed in), made-up order.
export async function getPreviewInvoice(override?: StoreSettings): Promise<InvoiceData> {
  const settings = override || (await getStoreSettings()).settings;
  const items: InvoiceItem[] = [
    { name: "Velvira Eau de Parfum 50ml", sku: "VEL-50ML-001", qty: 1, unitPrice: 899, total: 899 },
    { name: "Raafa Attar 6ml", sku: "RAA-6ML-004", qty: 2, unitPrice: 249.5, total: 499 },
  ];
  return {
    invoiceNo: `${settings.invoice.prefix}-${new Date().getFullYear()}-HK123456`,
    invoiceDate: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    orderId: "ORD-PREVIEW",
    orderNumber: "HK-123456",
    status: "confirmed",
    isCancelled: false,
    ...applySettings(settings),
    buyer: { name: "Sample Customer", email: "customer@example.com", phone: "9876543210", address: "12 MG Road", city: "Pune", state: "Maharashtra", pin: "411001" },
    items,
    subtotal: 1398,
    discount: 100,
    shipping: 0,
    tax: null,
    total: 1298,
    amountInWords: toWords(1298),
    gst: computeGst(1298, settings.invoice.gstRate, settings.seller.state, "Maharashtra"),
    fees: { handling: settings.invoice.handlingFee, delivery: settings.invoice.deliveryFee },
    deliveryCharged: null,
    payment: { method: "upi", status: "captured", id: "pay_SAMPLE123", via: "Razorpay" },
    awb: "1234567890123",
  };
}
