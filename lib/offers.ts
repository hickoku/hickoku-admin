// Offers & discounts, stored in DynamoDB (offers / offers-stage, see lib/aws.ts).
// The storefront reads this table (hickoku/lib/offers/repository.ts) and applies the
// offers with the shared rules in lib/offerEngine.ts.
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, OFFERS_TABLE } from "@/lib/aws";
import { isLive, normaliseCode, type Offer, type OfferLevel } from "@/lib/offerEngine";

export type StoredOffer = Offer & { createdAt?: string; updatedAt?: string };
export type OfferStatus = "live" | "scheduled" | "ended" | "used_up" | "off";

type Result<T> = ({ success: true } & T) | { success: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ success: false as const, error, status });

export function offerStatus(o: Offer, now = new Date()): OfferStatus {
  if (!o.enabled) return "off";
  if (isLive(o, now)) return "live";
  if (o.usageLimit && (o.usedCount || 0) >= o.usageLimit) return "used_up";
  if (o.endsAt && new Date(o.endsAt).getTime() <= now.getTime()) return "ended";
  return "scheduled";
}

const LEVELS: OfferLevel[] = ["product", "cart", "bxgy", "gift", "shipping"];
const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

function fromItem(i: Record<string, any>): StoredOffer {
  return {
    id: String(i.id),
    name: i.name || "",
    title: i.title || "",
    message: i.message || "",
    badge: i.badge || "",
    level: LEVELS.includes(i.level) ? i.level : "product",
    kind: i.kind === "flat" || i.kind === "per_item" ? i.kind : "percent",
    value: Number(i.value) || 0,
    maxDiscount: Number(i.maxDiscount) || 0,
    productIds: ids(i.productIds),
    minItems: Number(i.minItems) || 0,
    minSubtotal: Number(i.minSubtotal) || 0,
    buyQty: Number(i.buyQty) || 0,
    getQty: Number(i.getQty) || 0,
    getProductIds: ids(i.getProductIds),
    getKind: i.getKind === "percent" ? "percent" : "free",
    getValue: Number(i.getValue) || 0,
    giftProductId: i.giftProductId ? String(i.giftProductId) : null,
    eligibility: i.eligibility === "first_order" ? "first_order" : "everyone",
    usageLimit: Number(i.usageLimit) || 0,
    oncePerCustomer: i.oncePerCustomer === true,
    usedCount: Number(i.usedCount) || 0,
    startsAt: i.startsAt || null,
    endsAt: i.endsAt || null,
    enabled: i.enabled === true,
    sequence: Number(i.sequence) || 0,
    combinable: i.combinable !== false,
    couponCode: i.couponCode || null,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

const stageOf = (l: OfferLevel) => (l === "product" ? 0 : l === "bxgy" || l === "cart" ? 1 : 2);

export async function listOffers(): Promise<StoredOffer[]> {
  const items: Record<string, any>[] = [];
  let key: Record<string, any> | undefined;
  do {
    const r = await docClient.send(new ScanCommand({ TableName: OFFERS_TABLE, ExclusiveStartKey: key }));
    items.push(...(r.Items || []));
    key = r.LastEvaluatedKey;
  } while (key);
  return items
    .filter((i) => i.id)
    .map(fromItem)
    .sort((a, b) => stageOf(a.level) - stageOf(b.level) || a.sequence - b.sequence);
}

export async function getOffer(id: string): Promise<Result<{ offer: StoredOffer }>> {
  const r = await docClient.send(new GetCommand({ TableName: OFFERS_TABLE, Key: { PK: `OFFER#${id}` } }));
  if (!r.Item) return fail("Offer not found", 404);
  return { success: true, offer: fromItem(r.Item) };
}

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isoOrNull = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};
const int = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v) || 0);
  return Math.min(max, Math.max(min, n));
};
const pickIds = (v: unknown) => [...new Set(ids(v).filter(Boolean))];

// Turns form input into a clean offer, or explains what's wrong in plain words.
// `appliesTo` / `getAppliesTo` = "all" | "selected" decide whether the product lists count.
function clean(input: any): Result<{ offer: Offer }> {
  const name = str(input.name, 40);
  if (!name) return fail("Give the offer a name (shown to customers, e.g. \"Launch Offer\").");
  const level: OfferLevel | null = LEVELS.includes(input.level) ? input.level : null;
  if (!level) return fail("Choose an offer type.");
  const isOrder = level !== "product";

  // Discount amount: only product and cart offers have one.
  let kind: Offer["kind"] = "percent";
  let value = 0;
  let maxDiscount = 0;
  if (level === "product" || level === "cart") {
    const k = ["percent", "flat", "per_item"].includes(input.kind) ? input.kind : null;
    if (!k) return fail("Choose a discount type.");
    if (k === "per_item" && level !== "cart") return fail("\"Per bottle\" discounts only work on the order total.");
    kind = k;
    value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) return fail("Discount must be more than 0.");
    if (kind === "percent" && value > 90) return fail("Percentage discount can be at most 90%.");
    if (kind !== "percent" && value > 100000) return fail("Discount amount looks too large.");
    value = Math.round(value * 100) / 100;
    if (level === "cart" && kind === "percent" && input.maxDiscount) {
      maxDiscount = Number(input.maxDiscount);
      if (!Number.isFinite(maxDiscount) || maxDiscount < 0) return fail("Maximum discount must be a positive amount, or empty for no cap.");
      maxDiscount = Math.round(maxDiscount * 100) / 100;
    }
  }

  // Which products count. Free gifts and free shipping look at the whole cart.
  const usesProducts = level === "product" || level === "cart" || level === "bxgy";
  const productIds = usesProducts && input.appliesTo === "selected" ? pickIds(input.productIds) : [];
  if (usesProducts && input.appliesTo === "selected" && productIds.length === 0)
    return fail("Pick at least one product, or apply the offer to all products.");

  // Buy X get Y
  let buyQty = 0, getQty = 0, getValue = 0;
  let getKind: "free" | "percent" = "free";
  let getProductIds: string[] = [];
  if (level === "bxgy") {
    buyQty = int(input.buyQty, 0, 20);
    getQty = int(input.getQty, 0, 20);
    if (buyQty < 1) return fail("Customers must buy at least 1 bottle.");
    if (getQty < 1) return fail("Customers must get at least 1 bottle.");
    getKind = input.getKind === "percent" ? "percent" : "free";
    if (getKind === "percent") {
      getValue = Number(input.getValue);
      if (!Number.isFinite(getValue) || getValue <= 0 || getValue >= 100) return fail("Discount on the \"get\" bottles must be between 1% and 99%. Choose Free for 100%.");
    }
    if (input.getAppliesTo === "selected") {
      getProductIds = pickIds(input.getProductIds);
      if (getProductIds.length === 0) return fail("Pick at least one product customers can get, or use the same products they buy.");
    }
  }

  // Free gift
  let giftProductId: string | null = null;
  if (level === "gift") {
    giftProductId = str(input.giftProductId, 100) || null;
    if (!giftProductId) return fail("Choose the product to give for free.");
  }

  // Conditions on the cart (order offers only)
  const minItems = isOrder ? int(input.minItems, 0, 100) : 0;
  const minSubtotal = isOrder ? Math.max(0, Number(input.minSubtotal) || 0) : 0;
  if ((level === "gift" || level === "shipping") && !minItems && !minSubtotal)
    return fail(level === "gift" ? "Set a minimum cart value or number of bottles, otherwise every order gets the gift." : "Set a minimum cart value or number of bottles. For free delivery on every order, turn off delivery charges in Settings instead.");

  // Code, who, how often (order offers only: product prices are shown before checkout)
  let couponCode: string | null = null;
  if (isOrder && input.method === "code") {
    couponCode = normaliseCode(input.couponCode);
    if (!/^[A-Z0-9]{3,20}$/.test(couponCode)) return fail("Discount code must be 3–20 letters or numbers, no spaces (e.g. DIWALI15).");
  }
  const eligibility = isOrder && input.eligibility === "first_order" ? "first_order" : "everyone";
  const usageLimit = isOrder ? int(input.usageLimit, 0, 1_000_000) : 0;
  const oncePerCustomer = isOrder && input.oncePerCustomer === true;

  const startsAt = isoOrNull(input.startsAt);
  const endsAt = isoOrNull(input.endsAt);
  if (startsAt === undefined || endsAt === undefined) return fail("Start or end date is not a valid date.");
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return fail("End must be after the start.");
  const sequence = Math.floor(Number(input.sequence));
  if (!Number.isFinite(sequence) || sequence < 0 || sequence > 999) return fail("Order must be a number from 0 to 999.");

  return {
    success: true,
    offer: {
      id: "",
      name,
      title: str(input.title, 80),
      message: str(input.message, 200),
      badge: str(input.badge, 24),
      level,
      kind,
      value,
      maxDiscount,
      productIds,
      minItems,
      minSubtotal,
      buyQty,
      getQty,
      getProductIds,
      getKind,
      getValue,
      giftProductId,
      eligibility,
      usageLimit,
      oncePerCustomer,
      startsAt,
      endsAt,
      enabled: input.enabled === true,
      sequence,
      // Gifts and free delivery don't lower prices, so they always combine.
      combinable: level === "gift" || level === "shipping" ? true : input.combinable !== false,
      couponCode,
    },
  };
}

const newId = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "offer"}-${Date.now().toString(36).slice(-5)}`;

export async function saveOffer(input: any, existingId?: string): Promise<Result<{ offer: StoredOffer }>> {
  const c = clean(input);
  if (!c.success) return c;

  const all = await listOffers();
  if (c.offer.couponCode) {
    const taken = all.find((o) => o.id !== existingId && o.couponCode && normaliseCode(o.couponCode) === c.offer.couponCode);
    if (taken) return fail(`The code ${c.offer.couponCode} is already used by "${taken.name}". Pick another code.`);
  }

  const now = new Date().toISOString();
  let createdAt = now;
  let usedCount = 0;
  if (existingId) {
    const prev = all.find((o) => o.id === existingId);
    if (!prev) return fail("Offer not found", 404);
    createdAt = prev.createdAt || now;
    usedCount = prev.usedCount || 0; // counted by the store; never taken from the form
  }
  const id = existingId || newId(c.offer.name);
  const item = { PK: `OFFER#${id}`, ...c.offer, usedCount, id, createdAt, updatedAt: now };
  await docClient.send(
    new PutCommand({
      TableName: OFFERS_TABLE,
      Item: item,
      ...(existingId ? {} : { ConditionExpression: "attribute_not_exists(PK)" }),
    }),
  );
  return { success: true, offer: fromItem(item) };
}

// Form-shaped copy of a stored offer, so it can go back through saveOffer unchanged.
export function toInput(o: Offer) {
  return {
    ...o,
    appliesTo: o.productIds?.length ? "selected" : "all",
    getAppliesTo: o.getProductIds?.length ? "selected" : "same",
    method: o.couponCode ? "code" : "automatic",
  };
}

export async function setOfferEnabled(id: string, enabled: boolean): Promise<Result<{ offer: StoredOffer }>> {
  const prev = await getOffer(id);
  if (!prev.success) return prev;
  return saveOffer({ ...toInput(prev.offer), enabled }, id);
}

export async function deleteOffer(id: string): Promise<Result<{ id: string }>> {
  const prev = await getOffer(id);
  if (!prev.success) return prev;
  await docClient.send(new DeleteCommand({ TableName: OFFERS_TABLE, Key: { PK: `OFFER#${id}` } }));
  return { success: true, id };
}
