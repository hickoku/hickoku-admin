import { PutCommand, GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE } from "@/lib/aws";
import { cancelShipment, delhiveryBase, delhiveryToken } from "@/lib/delhivery";
import { envFor, APP_ENV, IS_PROD } from "@/lib/env";

// Shared logic for creating and cancelling orders that don't come from the
// storefront checkout — used by both the manual "Create Order" form and
// (eventually) the automated Amazon order sync, so there's exactly one place
// that talks to Delhivery and writes these orders to DynamoDB.

// Prod also accepts the _STAGE name: the live admin was set up that way and
// both environments use the same warehouse.
const WAREHOUSE_NAME = envFor("DELHIVERY_WAREHOUSE_NAME") || (IS_PROD ? process.env.DELHIVERY_WAREHOUSE_NAME_STAGE || "" : "");

// Delhivery return/pickup address — deliberately separate from the SELLER_*
// invoice env vars, since the legal/GST address and the physical warehouse
// address that Delhivery picks up from and returns to can differ.
const RETURN_NAME = process.env.DELHIVERY_RETURN_NAME || process.env.SELLER_NAME || "";
const RETURN_ADD = process.env.DELHIVERY_RETURN_ADD || "";
const RETURN_CITY = process.env.DELHIVERY_RETURN_CITY || "";
const RETURN_STATE = process.env.DELHIVERY_RETURN_STATE || "";
const RETURN_PIN = process.env.DELHIVERY_RETURN_PIN || "";
const RETURN_PHONE = process.env.DELHIVERY_RETURN_PHONE || "";

export const VALID_SOURCES = ["amazon", "influencer", "other"] as const;
export type OrderSource = (typeof VALID_SOURCES)[number];

export type OrderItemInput = { productName: string; qty: number; unitPrice: number };

export type CreateManualOrderInput = {
  customOrderNumber: string;
  source: OrderSource;
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pin: string | number;
  items: OrderItemInput[];
  // Extra fields merged onto the DynamoDB item as-is — lets callers (like the
  // future Amazon sync) attach their own linking fields (e.g. amazonOrderId,
  // amazonOrderItemIds for confirmShipment) without this function needing to
  // know about every possible source's specifics.
  extra?: Record<string, any>;
};

export type ActionResult<T> = { success: true } & T | { success: false; error: string; status: number };

export async function createManualOrder(
  input: CreateManualOrderInput,
): Promise<ActionResult<{ orderId: string; waybill: string; order: any }>> {
  const { customOrderNumber, source, firstName, lastName, email, phone, address, city, state, pin, items, extra } = input;

  if (!customOrderNumber || !firstName || !phone || !address || !city || !state || !pin || !items?.length) {
    return { success: false, error: "Missing required fields", status: 400 };
  }
  if (!VALID_SOURCES.includes(source)) {
    return { success: false, error: "Invalid source", status: 400 };
  }
  if (!WAREHOUSE_NAME) {
    return {
      success: false,
      error: `DELHIVERY_WAREHOUSE_NAME_${IS_PROD ? "PROD" : "STAGE"} is not configured (APP_ENV=${APP_ENV})`,
      status: 500,
    };
  }
  if (!RETURN_ADD || !RETURN_CITY || !RETURN_STATE || !RETURN_PIN || !RETURN_PHONE) {
    return {
      success: false,
      error: "Delhivery return-address env vars aren't fully configured — set DELHIVERY_RETURN_ADD, _CITY, _STATE, _PIN, _PHONE. See .env.example.",
      status: 500,
    };
  }

  const internalOrderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const fullName = `${firstName} ${lastName || ""}`.trim();
  const totalQty = items.reduce((s, i) => s + Number(i.qty), 0);
  const totalAmount = items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0);
  const productsDesc = items.map((i) => i.productName).join(", ");

  const delhiveryPayload = {
    shipments: [
      {
        name: fullName,
        add: address,
        pin: String(pin),
        city,
        state,
        country: "India",
        phone,
        order: customOrderNumber,
        payment_mode: "Prepaid",
        return_pin: RETURN_PIN,
        return_city: RETURN_CITY,
        return_phone: RETURN_PHONE,
        return_add: RETURN_ADD,
        return_state: RETURN_STATE,
        return_country: "India",
        return_name: RETURN_NAME,
        products_desc: productsDesc,
        hsn_code: "",
        cod_amount: "0",
        order_date: new Date().toISOString(),
        total_amount: String(totalAmount),
        seller_add: RETURN_ADD,
        seller_name: RETURN_NAME,
        seller_inv: customOrderNumber,
        quantity: String(totalQty),
        waybill: "",
        shipment_width: String(totalQty * 55),
        shipping_mode: "Surface",
        address_type: "",
      },
    ],
    pickup_location: { name: WAREHOUSE_NAME },
  };

  const formData = new URLSearchParams();
  formData.append("format", "json");
  formData.append("data", JSON.stringify(delhiveryPayload));

  const delhiveryRes = await fetch(`${delhiveryBase()}/api/cmu/create.json`, {
    method: "POST",
    headers: {
      Authorization: `Token ${delhiveryToken()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: formData.toString(),
  });

  const delhiveryData = await delhiveryRes.json();

  if (delhiveryData.success === false) {
    const errorMsg = delhiveryData.packages?.[0]?.remarks?.[0] || delhiveryData.error || "Failed to create shipment in Delhivery";
    return { success: false, error: errorMsg, status: 400 };
  }

  const waybill = delhiveryData.packages?.[0]?.waybill;
  if (!waybill) {
    return { success: false, error: "Delhivery did not return a waybill number", status: 500 };
  }

  const orderData = {
    PK: `ORDER#${internalOrderId}`,
    SK: "METADATA",
    orderId: internalOrderId,
    orderNumber: customOrderNumber,
    status: "confirmed",
    paymentStatus: "paid",
    source, // "amazon" | "influencer" | "other" — distinguishes from real storefront checkouts
    manuallyCreated: true, // only orders with this flag can be cancelled via the admin panel
    total: totalAmount,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customerFirstName: firstName,
    customerLastName: lastName || "",
    // Amazon doesn't share the buyer's real email — leave it out rather than storing an empty string.
    ...(email ? { customerEmail: email } : {}),
    customerPhone: phone,
    shippingAddress: {
      firstName,
      lastName,
      ...(email ? { email } : {}),
      phone,
      street: address,
      city,
      state,
      zipCode: String(pin),
      country: "India",
    },
    items: items.map((i) => ({
      productName: i.productName,
      quantity: Number(i.qty),
      price: Number(i.unitPrice),
      total: Number(i.qty) * Number(i.unitPrice),
    })),
    awb: waybill,
    ...extra,
  };

  await docClient.send(new PutCommand({ TableName: ORDERS_TABLE, Item: orderData }));

  return { success: true, orderId: internalOrderId, waybill, order: orderData };
}

export async function cancelOrder(id: string, force = false): Promise<ActionResult<{ delhivery: string | null; alreadyCancelled?: boolean }>> {
  if (!id) {
    return { success: false, error: "Missing id", status: 400 };
  }

  const PK = id.startsWith("ORDER#") ? id : `ORDER#${id}`;
  const SK = "METADATA";

  const existing = await docClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { PK, SK } }));
  if (!existing.Item) {
    return { success: false, error: "Order not found", status: 404 };
  }
  if (!existing.Item.manuallyCreated) {
    return {
      success: false,
      error: "Only manually-created orders (Amazon / Influencer / Other) can be cancelled here.",
      status: 403,
    };
  }
  if (existing.Item.status === "cancelled") {
    return { success: true, delhivery: null, alreadyCancelled: true };
  }

  let delhiveryMessage: string | null = null;
  if (existing.Item.awb) {
    const result = await cancelShipment(existing.Item.awb);
    if (!result.success && !force) {
      return {
        success: false,
        error: `Delhivery wouldn't cancel this shipment: ${result.message}`,
        status: 409,
      };
    }
    delhiveryMessage = result.message;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { PK, SK },
      UpdateExpression: "SET #status = :cancelled, cancelledAt = :now, updatedAt = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":cancelled": "cancelled", ":now": new Date().toISOString() },
    }),
  );

  return { success: true, delhivery: delhiveryMessage };
}

// ---------------------------------------------------------------------------
// Read / Update / Delete
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "failed"] as const;
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;

function orderKey(id: string) {
  return { PK: id.startsWith("ORDER#") ? id : `ORDER#${id}`, SK: "METADATA" };
}

export async function getOrder(id: string): Promise<ActionResult<{ order: any }>> {
  if (!id) return { success: false, error: "Missing id", status: 400 };
  const res = await docClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: orderKey(id) }));
  if (!res.Item) return { success: false, error: "Order not found", status: 404 };
  return { success: true, order: res.Item };
}

export type UpdateOrderInput = {
  status?: string;
  paymentStatus?: string;
  orderNumber?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: { street?: string; city?: string; state?: string; zipCode?: string };
  awb?: string;
  adminNotes?: string;
  items?: EditItemInput[];
};

// An item as sent by the edit form. sku/size are editable; productId,
// variantId and image are passed back untouched so storefront items keep
// their links to the catalogue.
export type EditItemInput = OrderItemInput & {
  sku?: string;
  size?: string;
  productId?: string;
  variantId?: string;
  image?: string;
};

// Fields the edit form may change. Anything else in the request body is
// ignored, so payment IDs, Razorpay links, timestamps etc. can't be touched.
const STRING_FIELDS = [
  "status",
  "paymentStatus",
  "orderNumber",
  "customerFirstName",
  "customerLastName",
  "customerEmail",
  "customerPhone",
  "awb",
  "adminNotes",
] as const;
const REQUIRED_FIELDS = new Set(["status", "orderNumber", "customerFirstName", "customerPhone"]);
// Storefront orders keep their HK-xxx order number, which the customer sees.
const MANUAL_ONLY_FIELDS = new Set(["orderNumber"]);

// Edits an order's details. Works on every order (storefront and manual), but
// storefront orders can't have their order number changed. It only
// writes DynamoDB: it does NOT refund on Razorpay or edit/cancel the courier
// shipment. Each edit is appended to the order's `editHistory` with the
// previous values, so changes to real orders stay auditable.
export async function updateOrder(id: string, input: UpdateOrderInput): Promise<ActionResult<{ order: any }>> {
  const found = await getOrder(id);
  if (!found.success) return found;
  const existing = found.order;
  const manual = !!existing.manuallyCreated;

  const changes: Record<string, any> = {};
  const removals: string[] = [];

  for (const field of STRING_FIELDS) {
    if (!(field in input) || input[field] === undefined) continue;
    const value = String(input[field] ?? "").trim();
    if ((existing[field] ?? "") === value) continue;
    if (!value) {
      if (REQUIRED_FIELDS.has(field)) return { success: false, error: `${field} can't be empty`, status: 400 };
      if (existing[field] !== undefined) removals.push(field);
      continue;
    }
    changes[field] = value;
  }

  if (changes.status && !ORDER_STATUSES.includes(changes.status)) {
    return { success: false, error: `Invalid status "${changes.status}"`, status: 400 };
  }
  if (changes.paymentStatus && !PAYMENT_STATUSES.includes(changes.paymentStatus)) {
    return { success: false, error: `Invalid payment status "${changes.paymentStatus}"`, status: 400 };
  }
  // A manual order with a live Delhivery pickup must go through cancelOrder,
  // otherwise the panel says "cancelled" while the courier still collects it.
  if (changes.status === "cancelled" && manual && existing.awb) {
    return { success: false, error: "Use Cancel Order for this one, so its Delhivery pickup gets cancelled too.", status: 409 };
  }

  if (input.shippingAddress) {
    const prev = existing.shippingAddress || {};
    const next = { ...prev };
    let addrChanged = false;
    for (const k of ["street", "city", "state", "zipCode"] as const) {
      const v = input.shippingAddress[k];
      if (v === undefined) continue;
      const trimmed = String(v).trim();
      if (!trimmed && !prev[k]) continue; // older orders may never have had this field
      if (!trimmed) return { success: false, error: `Address ${k} can't be empty`, status: 400 };
      if (prev[k] !== trimmed) {
        next[k] = trimmed;
        addrChanged = true;
      }
    }
    if (addrChanged) changes.shippingAddress = next;
  }

  if (input.items !== undefined) {
    if (!Array.isArray(input.items) || !input.items.length) {
      return { success: false, error: "An order needs at least one item", status: 400 };
    }
    const items = input.items.map((i) => {
      const quantity = Number(i.qty);
      const price = Number(i.unitPrice);
      const item: Record<string, any> = {
        productName: String(i.productName || "").trim(),
        quantity,
        price,
        total: quantity * price,
      };
      for (const k of ["sku", "size", "productId", "variantId", "image"] as const) {
        const v = typeof i[k] === "string" ? i[k]!.trim() : "";
        if (v) item[k] = v;
      }
      return item;
    });
    if (items.some((i) => !i.productName || !(i.quantity >= 1) || !(i.price >= 0))) {
      return { success: false, error: "Each item needs a name, a quantity of 1 or more, and a price of 0 or more", status: 400 };
    }
    const comparable = (list: any[]) =>
      JSON.stringify(list.map((i) => [i.productName, i.quantity, i.price, i.sku ?? "", i.size ?? "", i.productId ?? "", i.variantId ?? "", i.image ?? ""]));
    if (comparable(items) !== comparable(existing.items || [])) {
      const newSubtotal = items.reduce((s, i) => s + i.total, 0);
      changes.items = items;
      if (manual || typeof existing.total !== "number") {
        changes.total = newSubtotal;
      } else {
        // Storefront totals include shipping, tax and discounts. Move the total
        // by exactly the change in item value so those stay as they were.
        const oldSubtotal =
          typeof existing.subtotal === "number"
            ? existing.subtotal
            : (existing.items || []).reduce((s: number, i: any) => s + Number(i.total ?? Number(i.price) * Number(i.quantity)), 0);
        changes.total = Math.max(0, existing.total + (newSubtotal - oldSubtotal));
        changes.subtotal = newSubtotal;
      }
    }
  }

  const blocked = [...Object.keys(changes), ...removals].filter((f) => MANUAL_ONLY_FIELDS.has(f));
  if (!manual && blocked.length) {
    return { success: false, error: `Storefront orders can't change: ${blocked.join(", ")}`, status: 403 };
  }

  const changedFields = [...Object.keys(changes), ...removals];
  if (!changedFields.length) return { success: true, order: existing };

  const now = new Date().toISOString();
  const before: Record<string, any> = {};
  for (const f of changedFields) before[f] = existing[f] ?? null;

  const names: Record<string, string> = {};
  const values: Record<string, any> = {};
  const sets: string[] = [];
  Object.entries(changes).forEach(([field, value], i) => {
    names[`#f${i}`] = field;
    values[`:v${i}`] = value;
    sets.push(`#f${i} = :v${i}`);
  });
  removals.forEach((field, i) => (names[`#r${i}`] = field));

  // Keep the customer fields inside shippingAddress in step with the top-level ones.
  const addr = changes.shippingAddress || (existing.shippingAddress ? { ...existing.shippingAddress } : null);
  if (addr) {
    let touched = !!changes.shippingAddress;
    const sync: [string, string][] = [
      ["customerFirstName", "firstName"],
      ["customerLastName", "lastName"],
      ["customerPhone", "phone"],
      ["customerEmail", "email"],
    ];
    for (const [top, inner] of sync) {
      if (top in changes) {
        addr[inner] = changes[top];
        touched = true;
      } else if (removals.includes(top)) {
        delete addr[inner];
        touched = true;
      }
    }
    // When the address itself changed, `addr` is the same object already queued
    // in `values`, so the edits above are included in that write.
    if (touched && !changes.shippingAddress) {
      names["#addr"] = "shippingAddress";
      values[":addr"] = addr;
      sets.push("#addr = :addr");
    }
  }

  names["#hist"] = "editHistory";
  values[":now"] = now;
  values[":entry"] = [{ at: now, fields: changedFields, before }];
  values[":empty"] = [];
  sets.push("updatedAt = :now", "#hist = list_append(if_not_exists(#hist, :empty), :entry)");

  const removeClause = removals.length ? ` REMOVE ${removals.map((_, i) => `#r${i}`).join(", ")}` : "";
  const res = await docClient.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: orderKey(id),
      UpdateExpression: `SET ${sets.join(", ")}${removeClause}`,
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );

  return { success: true, order: res.Attributes };
}

// Permanently removes an order (storefront or manual), e.g. to clear out test
// orders. If the order still has an active shipment (an AWB and not
// cancelled), the caller must pass force=true: deleting does NOT cancel the
// courier pickup, so that should normally be done first via cancelOrder.
export async function deleteOrder(id: string, force = false): Promise<ActionResult<{ orderId: string }>> {
  const found = await getOrder(id);
  if (!found.success) return found;
  const order = found.order;

  if (order.awb && !["cancelled", "delivered"].includes(order.status) && !force) {
    return {
      success: false,
      error: `This order has an active shipment (AWB ${order.awb}). Deleting it won't cancel the pickup.`,
      status: 409,
    };
  }

  await docClient.send(
    new DeleteCommand({
      TableName: ORDERS_TABLE,
      Key: orderKey(id),
      ConditionExpression: "attribute_exists(PK)",
    }),
  );

  return { success: true, orderId: order.orderId };
}

// Deletes several orders after the admin has confirmed once in the UI (which
// warns about storefront orders and active shipments), so it deletes with
// force. Each id is handled on its own; one failure doesn't stop the rest.
export async function deleteOrders(ids: string[]): Promise<{ deleted: string[]; failed: { id: string; error: string }[] }> {
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          return { id, result: await deleteOrder(id, true) };
        } catch (e: any) {
          return { id, result: { success: false as const, error: e.message || "Delete failed", status: 500 } };
        }
      }),
    );
    for (const { id, result } of results) {
      if (result.success) deleted.push(id);
      else failed.push({ id, error: result.error });
    }
  }
  return { deleted, failed };
}
