import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, SETTINGS_TABLE } from "@/lib/aws";

// Checkout switches the storefront reads (storefront: lib/settings/checkout.ts).
// Kept in the site-settings[-stage] table as their own row (id = "checkout") so saving
// Store details never overwrites them. A switch that was never set here is stored as
// missing, and the storefront then uses its old env var (ENABLE_DELHIVERY /
// ENABLE_GEOLOCATION). "Charge shipping" has no env fallback: unset = off (free delivery).

export const CHECKOUT_SWITCHES = {
  shipping: {
    label: "Charge shipping",
    help: "On: the delivery fee (Delhivery rate for the customer's PIN code, else ₹50) is added to what the customer pays. Off: it is shown struck out as FREE.",
    envName: null,
  },
  delhivery: {
    label: "Delhivery",
    help: "Checks the customer's PIN code, gets the Delhivery delivery rate, and books the shipment automatically after payment.",
    envName: "ENABLE_DELHIVERY",
  },
  geolocation: {
    label: "“Use current location” button",
    help: "Lets customers fill the address form from their phone's location.",
    envName: "ENABLE_GEOLOCATION",
  },
} as const;

export type CheckoutSwitch = keyof typeof CHECKOUT_SWITCHES;
export type CheckoutSwitches = Partial<Record<CheckoutSwitch, boolean>> & { updatedAt?: string };

const KEY = { id: "checkout" };

export async function getCheckoutSwitches(): Promise<CheckoutSwitches> {
  const r = await docClient.send(new GetCommand({ TableName: SETTINGS_TABLE, Key: KEY }));
  const out: CheckoutSwitches = { updatedAt: r.Item?.updatedAt };
  for (const k of Object.keys(CHECKOUT_SWITCHES) as CheckoutSwitch[]) {
    if (typeof r.Item?.[k] === "boolean") out[k] = r.Item[k];
  }
  return out;
}

export async function setCheckoutSwitch(key: string, value: unknown): Promise<CheckoutSwitches> {
  if (!(key in CHECKOUT_SWITCHES)) throw Object.assign(new Error("Unknown switch"), { status: 400 });
  if (typeof value !== "boolean") throw Object.assign(new Error("Value must be on or off"), { status: 400 });
  await docClient.send(
    new UpdateCommand({
      TableName: SETTINGS_TABLE,
      Key: KEY,
      UpdateExpression: "SET #k = :v, updatedAt = :t",
      ExpressionAttributeNames: { "#k": key },
      ExpressionAttributeValues: { ":v": value, ":t": new Date().toISOString() },
    }),
  );
  return getCheckoutSwitches();
}
