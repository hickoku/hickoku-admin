import { PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE } from "@/lib/aws";
import { cancelShipment } from "@/lib/delhivery";

// Shared logic for creating and cancelling orders that don't come from the
// storefront checkout — used by both the manual "Create Order" form and
// (eventually) the automated Amazon order sync, so there's exactly one place
// that talks to Delhivery and writes these orders to DynamoDB.

const DELHIVERY_BASE = process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com";
const WAREHOUSE_NAME = process.env.DELHIVERY_WAREHOUSE_NAME || process.env.DELHIVERY_WAREHOUSE_NAME_STAGE || "";

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
      error: "DELHIVERY_WAREHOUSE_NAME (or DELHIVERY_WAREHOUSE_NAME_STAGE) is not configured",
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

  const delhiveryRes = await fetch(`${DELHIVERY_BASE}/api/cmu/create.json`, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
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
