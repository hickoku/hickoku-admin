import { ScanCommand, GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, PRODUCTS_TABLE, VARIANTS_TABLE, PRODUCT_WRITES_ENABLED } from "@/lib/aws";
import { APP_ENV } from "@/lib/env";

// Product catalogue CRUD. Same item shapes the storefront reads
// (hickoku/app/repositories/products.repository.ts):
//   products:         PK "PRODUCT#<id>", id, name, slug, category, description,
//                     highlight, badge, images[], status (bool), basePrice
//   product_variants: PK "VARIANT#<id>", id, productId (GSI productId-index),
//                     size, sku, price, stock, inventoryStatus, shortDesc,
//                     desc, characterstics[] (sic: the storefront reads this
//                     spelling), status (bool), weight
// Writes only run on stage (PRODUCT_WRITES_ENABLED); prod is read-only.

export type Variant = {
  id: string;
  size: string;
  sku: string;
  price: number;
  stock: number;
  inventoryStatus: string;
  shortDesc: string;
  desc: string;
  characteristics: string[];
  status: boolean;
  weight?: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  highlight: string;
  badge: string;
  images: string[];
  status: boolean;
  basePrice: number;
  variants: Variant[];
};

type Result<T> = ({ success: true } & T) | { success: false; error: string; status: number };

const READ_ONLY: Result<never> = {
  success: false,
  error: `Products are read-only on ${APP_ENV}. Edit them in the stage admin.`,
  status: 403,
};

async function scanAll(table: string): Promise<any[]> {
  const items: any[] = [];
  let startKey: Record<string, any> | undefined;
  do {
    const page: any = await docClient.send(new ScanCommand({ TableName: table, ExclusiveStartKey: startKey }));
    items.push(...(page.Items || []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

function toVariant(v: any): Variant {
  return {
    id: String(v.id ?? String(v.PK || "").replace("VARIANT#", "")),
    size: v.size || "",
    sku: v.sku || "",
    price: Number(v.price) || 0,
    stock: Number(v.stock) || 0,
    inventoryStatus: v.inventoryStatus || "",
    shortDesc: v.shortDesc || v.short_desc || "",
    desc: v.desc || "",
    characteristics: Array.from(v.characterstics || v.characteristics || []).map(String),
    status: v.status !== false,
    ...(v.weight != null ? { weight: Number(v.weight) } : {}),
  };
}

function toProduct(p: any, variants: Variant[]): Product {
  return {
    id: String(p.id ?? String(p.PK || "").replace("PRODUCT#", "")),
    name: p.name || "",
    slug: p.slug || "",
    category: p.category || "",
    description: p.description || "",
    highlight: p.highlight || "",
    badge: p.badge || "",
    images: Array.isArray(p.images) ? p.images.map(String) : [],
    status: p.status !== false,
    basePrice: Number(p.basePrice) || 0,
    variants: variants.sort((a, b) => a.price - b.price),
  };
}

const byNumericId = (a: { id: string }, b: { id: string }) => (Number(a.id) || 0) - (Number(b.id) || 0) || a.id.localeCompare(b.id);

export async function listProducts(): Promise<Product[]> {
  const [parents, variants] = await Promise.all([scanAll(PRODUCTS_TABLE), scanAll(VARIANTS_TABLE)]);
  const byProduct = new Map<string, Variant[]>();
  for (const v of variants) {
    const pid = String(v.productId);
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid)!.push(toVariant(v));
  }
  return parents.map((p) => toProduct(p, byProduct.get(String(p.id)) || [])).sort(byNumericId);
}

async function variantsOf(productId: string): Promise<any[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: VARIANTS_TABLE,
      IndexName: "productId-index",
      KeyConditionExpression: "productId = :pid",
      ExpressionAttributeValues: { ":pid": productId },
    }),
  );
  return res.Items || [];
}

export async function getProduct(id: string): Promise<Result<{ product: Product }>> {
  const res = await docClient.send(new GetCommand({ TableName: PRODUCTS_TABLE, Key: { PK: `PRODUCT#${id}` } }));
  if (!res.Item) return { success: false, error: "Product not found", status: 404 };
  return { success: true, product: toProduct(res.Item, (await variantsOf(id)).map(toVariant)) };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const str = (v: any, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

type CleanVariant = Omit<Variant, "id" | "inventoryStatus"> & { id?: string };

function clean(input: any): { product: Omit<Product, "id" | "variants">; variants: CleanVariant[] } | { error: string } {
  const name = str(input?.name, 120);
  if (!name) return { error: "Product name is required" };
  const slug = slugify(str(input?.slug, 80) || name);
  if (!slug) return { error: "Slug can only use letters, numbers and dashes" };

  const images = (Array.isArray(input?.images) ? input.images : [])
    .map((u: any) => str(u, 500))
    .filter((u: string) => u && (u.startsWith("/") || /^https:\/\//.test(u)));
  if (images.length > 12) return { error: "A product can have at most 12 images" };

  const rawVariants = Array.isArray(input?.variants) ? input.variants : [];
  if (!rawVariants.length) return { error: "Add at least one size / variant" };
  const variants: CleanVariant[] = [];
  for (const [i, v] of rawVariants.entries()) {
    const size = str(v?.size, 40);
    const sku = str(v?.sku, 60).toUpperCase();
    const price = Number(v?.price);
    const stock = Number(v?.stock);
    const label = size || `#${i + 1}`;
    if (!size) return { error: `Variant ${i + 1}: size is required (e.g. 6ml)` };
    if (!sku) return { error: `Variant ${label}: SKU is required` };
    if (!Number.isFinite(price) || price < 0) return { error: `Variant ${label}: price must be 0 or more` };
    if (!Number.isInteger(stock) || stock < 0) return { error: `Variant ${label}: stock must be a whole number, 0 or more` };
    const weight = v?.weight === "" || v?.weight == null ? undefined : Number(v.weight);
    variants.push({
      ...(v?.id ? { id: String(v.id) } : {}),
      size,
      sku,
      price: Math.round(price * 100) / 100,
      stock,
      shortDesc: str(v?.shortDesc, 300),
      desc: str(v?.desc, 4000),
      characteristics: (Array.isArray(v?.characteristics) ? v.characteristics : String(v?.characteristics || "").split("\n"))
        .map((c: any) => str(c, 200))
        .filter(Boolean)
        .slice(0, 20),
      status: v?.status !== false,
      ...(weight != null && Number.isFinite(weight) && weight >= 0 ? { weight } : {}),
    });
  }
  const skus = variants.map((v) => v.sku);
  const dup = skus.find((s, i) => skus.indexOf(s) !== i);
  if (dup) return { error: `SKU ${dup} is used twice` };

  return {
    product: {
      name,
      slug,
      category: str(input?.category, 60),
      description: str(input?.description, 300),
      highlight: str(input?.highlight, 300),
      badge: str(input?.badge, 30),
      images,
      status: input?.status !== false,
      basePrice: Math.min(...variants.map((v) => v.price)),
    },
    variants,
  };
}

// ---------------------------------------------------------------------------
// Writes (stage only)
// ---------------------------------------------------------------------------

async function batchWrite(table: string, requests: any[]) {
  for (let i = 0; i < requests.length; i += 25) {
    let pending: any = { [table]: requests.slice(i, i + 25) };
    for (let tries = 0; pending && tries < 5; tries++) {
      const r = await docClient.send(new BatchWriteCommand({ RequestItems: pending }));
      pending = r.UnprocessedItems && Object.keys(r.UnprocessedItems).length ? r.UnprocessedItems : null;
    }
    if (pending) throw new Error("DynamoDB didn't accept all variant changes, please retry");
  }
}

function variantItem(productId: string, id: string, v: CleanVariant) {
  return {
    PK: `VARIANT#${id}`,
    id,
    productId,
    size: v.size,
    sku: v.sku,
    price: v.price,
    stock: v.stock,
    inventoryStatus: v.stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
    shortDesc: v.shortDesc,
    short_desc: v.shortDesc, // older storefront code reads this name
    desc: v.desc,
    characterstics: v.characteristics, // storefront's spelling
    status: v.status,
    ...(v.weight != null ? { weight: v.weight } : {}),
  };
}

// Saves a product and its variants. Variant ids follow the existing pattern
// (product 1 → 101, 102 …); variants removed in the form are deleted.
export async function saveProduct(input: any, existingId?: string): Promise<Result<{ product: Product }>> {
  if (!PRODUCT_WRITES_ENABLED) return READ_ONLY;
  const c = clean(input);
  if ("error" in c) return { success: false, error: c.error, status: 400 };

  const [parents, allVariants] = await Promise.all([scanAll(PRODUCTS_TABLE), scanAll(VARIANTS_TABLE)]);

  if (existingId && !parents.some((p) => String(p.id) === existingId)) {
    return { success: false, error: "Product not found", status: 404 };
  }
  const slugOwner = parents.find((p) => p.slug === c.product.slug && String(p.id) !== existingId);
  if (slugOwner) return { success: false, error: `Slug "${c.product.slug}" is already used by ${slugOwner.name}`, status: 409 };
  const skuOwner = allVariants.find((v) => String(v.productId) !== existingId && c.variants.some((cv) => cv.sku === String(v.sku).toUpperCase()));
  if (skuOwner) return { success: false, error: `SKU ${skuOwner.sku} already belongs to another product`, status: 409 };

  const id = existingId || String(Math.max(0, ...parents.map((p) => Number(p.id) || 0)) + 1);
  const mine = allVariants.filter((v) => String(v.productId) === id);
  const takenIds = new Set(allVariants.map((v) => String(v.id ?? String(v.PK).replace("VARIANT#", ""))));

  // Keep ids of variants that still exist; give new ones the next free id.
  const nextId = () => {
    for (let n = 1; n < 1000; n++) {
      const candidate = String(Number(id) * 100 + n);
      if (!takenIds.has(candidate)) {
        takenIds.add(candidate);
        return candidate;
      }
    }
    throw new Error("Ran out of variant ids for this product");
  };
  const mineIds = new Set(mine.map((v) => String(v.id ?? String(v.PK).replace("VARIANT#", ""))));
  const finalVariants = c.variants.map((v) => ({ id: v.id && mineIds.has(v.id) ? v.id : nextId(), v }));
  const keep = new Set(finalVariants.map((f) => f.id));
  const removed = [...mineIds].filter((vid) => !keep.has(vid));

  await docClient.send(
    new PutCommand({
      TableName: PRODUCTS_TABLE,
      Item: { PK: `PRODUCT#${id}`, id, ...c.product, ...(c.product.badge ? {} : { badge: null }), updatedAt: new Date().toISOString() },
    }),
  );
  await batchWrite(VARIANTS_TABLE, [
    ...finalVariants.map(({ id: vid, v }) => ({ PutRequest: { Item: variantItem(id, vid, v) } })),
    ...removed.map((vid) => ({ DeleteRequest: { Key: { PK: `VARIANT#${vid}` } } })),
  ]);

  return getProduct(id);
}

export async function deleteProduct(id: string): Promise<Result<{ id: string; variantsDeleted: number }>> {
  if (!PRODUCT_WRITES_ENABLED) return READ_ONLY;
  const found = await docClient.send(new GetCommand({ TableName: PRODUCTS_TABLE, Key: { PK: `PRODUCT#${id}` } }));
  if (!found.Item) return { success: false, error: "Product not found", status: 404 };
  const variants = await variantsOf(id);
  await batchWrite(
    VARIANTS_TABLE,
    variants.map((v) => ({ DeleteRequest: { Key: { PK: v.PK } } })),
  );
  await docClient.send(new DeleteCommand({ TableName: PRODUCTS_TABLE, Key: { PK: `PRODUCT#${id}` } }));
  return { success: true, id, variantsDeleted: variants.length };
}
