// Offers & discounts, stored in DynamoDB (offers / offers-stage, see lib/aws.ts).
// The storefront reads this table (hickoku/lib/offers/repository.ts) and applies the
// offers with the shared rules in lib/offerEngine.ts.
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, OFFERS_TABLE } from "@/lib/aws";
import { isLive, type Offer } from "@/lib/offerEngine";

export type StoredOffer = Offer & { createdAt?: string; updatedAt?: string };
export type OfferStatus = "live" | "scheduled" | "ended" | "off";

type Result<T> = ({ success: true } & T) | { success: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ success: false as const, error, status });

export function offerStatus(o: Offer, now = new Date()): OfferStatus {
  if (!o.enabled) return "off";
  if (isLive(o, now)) return "live";
  if (o.endsAt && new Date(o.endsAt).getTime() <= now.getTime()) return "ended";
  return "scheduled";
}

function fromItem(i: Record<string, any>): StoredOffer {
  return {
    id: String(i.id),
    name: i.name || "",
    title: i.title || "",
    message: i.message || "",
    level: i.level === "cart" ? "cart" : "product",
    kind: i.kind === "flat" || i.kind === "per_item" ? i.kind : "percent",
    value: Number(i.value) || 0,
    productIds: Array.isArray(i.productIds) ? i.productIds.map(String) : [],
    minItems: Number(i.minItems) || 0,
    minSubtotal: Number(i.minSubtotal) || 0,
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
    .sort((a, b) => (a.level === b.level ? a.sequence - b.sequence : a.level === "product" ? -1 : 1));
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

function clean(input: any): Result<{ offer: Offer }> {
  const name = str(input.name, 40);
  if (!name) return fail("Give the offer a name (shown to customers, e.g. \"Launch Offer\").");
  const level = input.level === "cart" ? "cart" : input.level === "product" ? "product" : null;
  if (!level) return fail("Choose whether the offer changes product prices or the cart total.");
  const kind = ["percent", "flat", "per_item"].includes(input.kind) ? input.kind : null;
  if (!kind) return fail("Choose a discount type.");
  if (kind === "per_item" && level !== "cart") return fail("\"Per bottle\" discounts only work on the cart total.");
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) return fail("Discount must be more than 0.");
  if (kind === "percent" && value > 90) return fail("Percentage discount can be at most 90%.");
  if (kind !== "percent" && value > 100000) return fail("Discount amount looks too large.");
  const productIds = Array.isArray(input.productIds) ? [...new Set(input.productIds.map(String).filter(Boolean))] as string[] : [];
  if (input.appliesTo === "selected" && productIds.length === 0) return fail("Pick at least one product, or apply the offer to all products.");
  const minItems = level === "cart" ? Math.max(0, Math.floor(Number(input.minItems) || 0)) : 0;
  const minSubtotal = level === "cart" ? Math.max(0, Number(input.minSubtotal) || 0) : 0;
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
      level,
      kind,
      value: Math.round(value * 100) / 100,
      productIds: input.appliesTo === "selected" ? productIds : [],
      minItems,
      minSubtotal,
      startsAt,
      endsAt,
      enabled: input.enabled === true,
      sequence,
      combinable: input.combinable !== false,
      couponCode: null, // coupon codes are reserved for a later checkout coupon box
    },
  };
}

const newId = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "offer"}-${Date.now().toString(36).slice(-5)}`;

export async function saveOffer(input: any, existingId?: string): Promise<Result<{ offer: StoredOffer }>> {
  const c = clean(input);
  if (!c.success) return c;
  const now = new Date().toISOString();
  let createdAt = now;
  if (existingId) {
    const prev = await getOffer(existingId);
    if (!prev.success) return prev;
    createdAt = prev.offer.createdAt || now;
  }
  const id = existingId || newId(c.offer.name);
  const item = { PK: `OFFER#${id}`, ...c.offer, id, createdAt, updatedAt: now };
  await docClient.send(
    new PutCommand({
      TableName: OFFERS_TABLE,
      Item: item,
      ...(existingId ? {} : { ConditionExpression: "attribute_not_exists(PK)" }),
    }),
  );
  return { success: true, offer: fromItem(item) };
}

export async function setOfferEnabled(id: string, enabled: boolean): Promise<Result<{ offer: StoredOffer }>> {
  const prev = await getOffer(id);
  if (!prev.success) return prev;
  return saveOffer({ ...prev.offer, appliesTo: prev.offer.productIds?.length ? "selected" : "all", enabled }, id);
}

export async function deleteOffer(id: string): Promise<Result<{ id: string }>> {
  const prev = await getOffer(id);
  if (!prev.success) return prev;
  await docClient.send(new DeleteCommand({ TableName: OFFERS_TABLE, Key: { PK: `OFFER#${id}` } }));
  return { success: true, id };
}
