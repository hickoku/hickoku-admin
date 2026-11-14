import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, SETTINGS_TABLE } from "@/lib/aws";

// Store details + invoice layout, edited on Settings → Store details and kept
// in the site-settings[-stage] table as one row (id = "store"). Until that
// row is first saved, the SELLER_* env vars are used, so nothing changes
// before someone fills the form in.

export type SellerDetails = {
  name: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pin: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  bank: string;
  accountNo: string;
  ifsc: string;
};

// Every section the invoice can show. Turning one off hides it even when the
// value is filled in, so details can be kept on file but left off invoices.
export const INVOICE_TOGGLES = {
  sellerAddress: { label: "Business address", group: "Your business" },
  sellerPhone: { label: "Phone", group: "Your business" },
  sellerEmail: { label: "Email", group: "Your business" },
  sellerWebsite: { label: "Website", group: "Your business" },
  gstin: { label: "GSTIN (also makes it a Tax Invoice)", group: "Tax" },
  pan: { label: "PAN", group: "Tax" },
  gstBreakdown: { label: "GST breakdown (taxable value + GST)", group: "Tax" },
  cgstSgst: { label: "CGST + SGST lines (buyer in your state)", group: "Tax" },
  igst: { label: "IGST line (buyer in another state)", group: "Tax" },
  bankDetails: { label: "Bank details", group: "Payment" },
  paymentInfo: { label: "Payment method and reference", group: "Payment" },
  amountInWords: { label: "Amount in words", group: "Payment" },
  buyerPhone: { label: "Customer phone", group: "Customer" },
  buyerEmail: { label: "Customer email", group: "Customer" },
  sku: { label: "Product SKU", group: "Order" },
  awb: { label: "AWB / tracking number", group: "Order" },
  priceBreakdown: { label: "Subtotal and discount lines", group: "Order" },
  waivedFees: { label: "Handling and delivery fee shown as FREE", group: "Order" },
  signature: { label: "Authorised signatory block", group: "Footer" },
  terms: { label: "Terms and conditions", group: "Footer" },
  footerNote: { label: "Footer note", group: "Footer" },
} as const;

export type InvoiceToggle = keyof typeof INVOICE_TOGGLES;

export type InvoiceSettings = {
  // Empty = automatic: "Tax Invoice" when the GSTIN is shown, else "Invoice".
  title: string;
  prefix: string;
  terms: string;
  footerNote: string;
  thankYouNote: string;
  // Order totals include GST at this rate (same as the storefront's admin
  // email: taxable value = total / (1 + rate/100)).
  gstRate: number;
  // Shown struck through as "FREE" on the invoice, like the order emails.
  handlingFee: number;
  // Used when the order has no stored shippingCost.
  deliveryFee: number;
  show: Record<InvoiceToggle, boolean>;
};

export type StoreSettings = {
  seller: SellerDetails;
  invoice: InvoiceSettings;
  updatedAt?: string;
};

export function defaultSettings(): StoreSettings {
  const e = process.env;
  return {
    seller: {
      name: e.SELLER_NAME || "",
      address: e.SELLER_ADDRESS || "",
      city: e.SELLER_CITY || "",
      state: e.SELLER_STATE || "",
      stateCode: e.SELLER_STATE_CODE || "",
      pin: e.SELLER_PIN || "",
      phone: e.SELLER_PHONE || "",
      email: e.SELLER_EMAIL || "",
      website: e.SELLER_WEBSITE || "",
      gstin: e.SELLER_GSTIN || "",
      pan: e.SELLER_PAN || "",
      bank: e.SELLER_BANK_NAME || "",
      accountNo: e.SELLER_ACCOUNT_NO || "",
      ifsc: e.SELLER_IFSC || "",
    },
    invoice: {
      title: "",
      prefix: e.INVOICE_PREFIX || "INV",
      terms: e.SELLER_TERMS || "All sales are final.",
      footerNote: "This is a computer-generated invoice and does not require a physical signature.",
      thankYouNote: "Thank you for shopping with us!",
      gstRate: 18,
      handlingFee: 20,
      deliveryFee: 50,
      show: Object.fromEntries(Object.keys(INVOICE_TOGGLES).map((k) => [k, true])) as Record<InvoiceToggle, boolean>,
    },
  };
}

const KEY = { id: "store" };

// Stored values win; anything missing from the stored row (e.g. a toggle
// added in a later version) falls back to the default.
function merge(stored: any): StoreSettings {
  const d = defaultSettings();
  if (!stored) return d;
  return {
    seller: { ...d.seller, ...(stored.seller || {}) },
    invoice: {
      ...d.invoice,
      ...(stored.invoice || {}),
      show: { ...d.invoice.show, ...(stored.invoice?.show || {}) },
    },
    updatedAt: stored.updatedAt,
  };
}

export async function getStoreSettings(): Promise<{ settings: StoreSettings; saved: boolean }> {
  const res = await docClient.send(new GetCommand({ TableName: SETTINGS_TABLE, Key: KEY }));
  return { settings: merge(res.Item), saved: !!res.Item };
}

const str = (v: any, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Empty or invalid input keeps the default (Number("") would otherwise be 0).
const num = (v: any, fallback: number, max: number) => {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : fallback;
};

// Accepts the form's payload, keeps only known fields, and saves it.
export async function saveStoreSettings(input: any): Promise<StoreSettings> {
  const d = defaultSettings();
  const seller = Object.fromEntries(
    Object.keys(d.seller).map((k) => [k, str(input?.seller?.[k], k === "address" ? 300 : 120)]),
  ) as SellerDetails;
  if (!seller.name) throw Object.assign(new Error("Business name is required"), { status: 400 });
  if (seller.gstin && !/^[0-9A-Z]{15}$/.test(seller.gstin.toUpperCase())) {
    throw Object.assign(new Error("GSTIN should be 15 letters and numbers"), { status: 400 });
  }
  seller.gstin = seller.gstin.toUpperCase();
  seller.pan = seller.pan.toUpperCase();
  seller.ifsc = seller.ifsc.toUpperCase();

  const show = Object.fromEntries(
    Object.keys(INVOICE_TOGGLES).map((k) => [k, input?.invoice?.show?.[k] !== false]),
  ) as Record<InvoiceToggle, boolean>;

  const settings: StoreSettings = {
    seller,
    invoice: {
      title: str(input?.invoice?.title, 40),
      prefix: str(input?.invoice?.prefix, 12).toUpperCase() || "INV",
      terms: str(input?.invoice?.terms, 1000),
      footerNote: str(input?.invoice?.footerNote, 300),
      thankYouNote: str(input?.invoice?.thankYouNote, 120),
      gstRate: num(input?.invoice?.gstRate, d.invoice.gstRate, 28),
      handlingFee: num(input?.invoice?.handlingFee, d.invoice.handlingFee, 10000),
      deliveryFee: num(input?.invoice?.deliveryFee, d.invoice.deliveryFee, 10000),
      show,
    },
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({ TableName: SETTINGS_TABLE, Item: { ...KEY, ...settings } }));
  return settings;
}
