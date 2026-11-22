// Plain-words descriptions of offers for the admin screens, plus the
// "does the store support this yet" check. Client-safe (no AWS imports).
import { offerChip, type Offer, type OfferLevel } from "@/lib/offerEngine";

export const OFFER_TYPES: { value: OfferLevel; label: string; sub: string }[] = [
  { value: "product", label: "Amount off products", sub: "Lower the price shown on products" },
  { value: "cart", label: "Amount off order", sub: "% or ₹ off the cart at checkout" },
  { value: "bxgy", label: "Buy X get Y", sub: "e.g. buy 2, get 1 free" },
  { value: "gift", label: "Free gift", sub: "Free product over a cart value" },
  { value: "shipping", label: "Free delivery", sub: "Waive delivery over a cart value" },
];

export const typeLabel = (l: OfferLevel) => OFFER_TYPES.find((t) => t.value === l)?.label || l;

// True when the storefront needs its "offer types" release to apply this offer correctly.
// Why: see the note above offerTypesLive in lib/offers.ts.
export function needsStoreUpdate(o: Offer): boolean {
  if (o.level === "product") return false;
  if (o.level !== "cart") return true;
  return !!o.couponCode || !!o.maxDiscount || (o.eligibility || "everyone") !== "everyone" || !!o.usageLimit || !!o.oncePerCustomer;
}

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const names = (list: string[] | undefined, products: { id: string; name: string }[], all: string) =>
  list?.length ? products.filter((p) => list.includes(p.id)).map((p) => p.name).join(", ") || `${list.length} products` : all;

// One-line pieces for the offers table.
export function describe(o: Offer, products: { id: string; name: string }[]) {
  const chip = offerChip(o);
  let amount: string;
  if (o.level === "bxgy") amount = `Buy ${o.buyQty || 1}, get ${o.getQty || 1} ${o.getKind === "percent" ? `${o.getValue}% off` : "free"}`;
  else if (o.level === "gift") amount = `Free ${names(o.giftProductId ? [o.giftProductId] : [], products, "gift")}`;
  else if (o.level === "shipping") amount = "Free delivery";
  else if (o.kind === "per_item") amount = `${chip.big} off each bottle`;
  else amount = `${chip.big} off${o.level === "cart" ? " the order" : ""}`;
  if (o.level === "cart" && o.kind === "percent" && o.maxDiscount) amount += ` (max ${inr(o.maxDiscount)})`;

  const who = o.level === "gift" || o.level === "shipping" ? "whole cart" : names(o.productIds, products, "all products");
  const cond = [
    o.minItems ? `${o.minItems}+ bottles` : "",
    o.minSubtotal ? `cart ≥ ${inr(o.minSubtotal)}` : "",
    o.eligibility === "first_order" ? "first order only" : "",
    o.oncePerCustomer ? "once per customer" : "",
  ]
    .filter(Boolean)
    .join(", ");
  return { amount, who, cond };
}

// Bullet points for the "Summary" box on the offer form.
export function summaryLines(o: Offer, products: { id: string; name: string }[]): string[] {
  const d = describe(o, products);
  const lines = [d.amount];
  if (o.level === "bxgy") {
    lines.push(`Counts: ${names(o.productIds, products, "any product")}`);
    lines.push(`Free/cheaper bottles: ${o.getProductIds?.length ? names(o.getProductIds, products, "") : "the cheapest qualifying ones"}`);
  } else if (o.level !== "gift" && o.level !== "shipping") lines.push(`On ${d.who}`);
  if (o.minItems || o.minSubtotal) lines.push(`Needs ${[o.minItems ? `${o.minItems}+ bottles` : "", o.minSubtotal ? `a cart of ${inr(o.minSubtotal)}+` : ""].filter(Boolean).join(" and ")}`);
  if (o.level !== "product") lines.push(o.couponCode ? `Code ${o.couponCode} at checkout` : "Applies automatically");
  if (o.eligibility === "first_order") lines.push("First order only");
  if (o.usageLimit) lines.push(`Up to ${o.usageLimit.toLocaleString("en-IN")} orders in total`);
  if (o.oncePerCustomer) lines.push("Once per customer");
  if (o.level !== "gift" && o.level !== "shipping") lines.push(o.combinable ? "Combines with other offers" : "Doesn't combine with other offers");
  return lines;
}
