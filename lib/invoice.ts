import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE } from "@/lib/aws";
import { razorpayFetch } from "@/lib/razorpay";

// Seller identity — the LEGAL entity, deliberately independent of any
// storefront brand name (e.g. "Hickoku"). Every invoice shows only this.
export const SELLER = {
  name: process.env.SELLER_NAME || "",
  gstin: process.env.SELLER_GSTIN || "",
  pan: process.env.SELLER_PAN || "",
  address: process.env.SELLER_ADDRESS || "",
  city: process.env.SELLER_CITY || "",
  state: process.env.SELLER_STATE || "",
  stateCode: process.env.SELLER_STATE_CODE || "",
  pin: process.env.SELLER_PIN || "",
  phone: process.env.SELLER_PHONE || "",
  email: process.env.SELLER_EMAIL || "",
  website: process.env.SELLER_WEBSITE || "",
  bank: process.env.SELLER_BANK_NAME || "",
  accountNo: process.env.SELLER_ACCOUNT_NO || "",
  ifsc: process.env.SELLER_IFSC || "",
  terms: process.env.SELLER_TERMS || "All sales are final.",
};

const INVOICE_PREFIX = process.env.INVOICE_PREFIX || "INV";

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

export type InvoiceItem = { name: string; sku?: string; qty: number; unitPrice: number; total: number };

export type InvoiceData = {
  invoiceNo: string;
  invoiceDate: string;
  orderId: string;
  orderNumber: string;
  status: string;
  isCancelled: boolean;
  isTaxInvoice: boolean;
  seller: typeof SELLER;
  buyer: { name: string; email: string; phone: string; address: string; city: string; state: string; pin: string };
  items: InvoiceItem[];
  subtotal: number | null;
  discount: number | null;
  shipping: number | null;
  tax: number | null;
  total: number;
  amountInWords: string;
  payment: { method: string; status: string; id: string; via: string };
  awb: string | null;
};

export async function getInvoiceData(orderId: string): Promise<InvoiceData | null> {
  const res = await docClient.send(
    new ScanCommand({
      TableName: ORDERS_TABLE,
      FilterExpression: "orderId = :oid OR razorpayOrderId = :oid OR orderNumber = :oid",
      ExpressionAttributeValues: { ":oid": orderId },
    }),
  );
  const order = res.Items?.[0];
  if (!order) return null;

  const orderDate = new Date(order.createdAt || order.created_at || Date.now());
  const invoiceNo = `${INVOICE_PREFIX}-${orderDate.getFullYear()}-${(order.orderNumber || order.orderId || orderId).toString().slice(-8).toUpperCase()}`;

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

  return {
    invoiceNo,
    invoiceDate: orderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    orderId: order.orderId || orderId,
    orderNumber: order.orderNumber || order.orderId || orderId,
    status: order.status || "",
    isCancelled: order.status === "cancelled",
    isTaxInvoice: Boolean(SELLER.gstin),
    seller: SELLER,
    buyer,
    items,
    subtotal: typeof order.subtotal === "number" ? order.subtotal : null,
    discount: typeof order.surpriseDiscount === "number" ? order.surpriseDiscount : null,
    shipping: typeof order.shippingCost === "number" ? order.shippingCost : null,
    tax: typeof order.tax === "number" ? order.tax : null,
    total: typeof order.total === "number" ? order.total : items.reduce((s, i) => s + i.total, 0),
    amountInWords: toWords(typeof order.total === "number" ? order.total : items.reduce((s, i) => s + i.total, 0)),
    payment,
    awb: order.awb || null,
  };
}
