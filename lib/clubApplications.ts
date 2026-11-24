import { DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, CLUB_TABLE, VARIANTS_TABLE } from "@/lib/aws";
import { createManualOrder } from "@/lib/orderActions";
import { getClubSettings } from "@/lib/club";

// Hickoku Club applications, made on the storefront's /club/apply and reviewed on
// Club → Applications. Table club-applications[-stage], key "pk" (see the storefront's
// lib/club/applications.ts):
//   APP#HC-1001   an application       BLOCK#ig:<handle> / BLOCK#phone:<digits>   blocked
// Approving creates the ₹0 gift order (with its Delhivery shipment) and takes the bottle
// out of stock. Nothing is ordered or shipped before that.

export type AppStatus = "submitted" | "approving" | "approved" | "rejected"; // approving = order being created

export type ClubApplication = {
  pk: string;
  id: string;
  status: AppStatus;
  forWhom: "friend" | "self";
  recipientName: string;
  occasionId: string;
  occasionName: string;
  partyDate: string; // YYYY-MM-DD
  gift: { productId: string; variantId: string; sku: string; name: string; size: string; price: number; image: string };
  labelName?: string;
  instagram: string;
  whatsapp: string;
  email: string;
  adultConfirmed: boolean;
  termsVersion: number;
  termsAcceptedAt: string;
  address: { firstName: string; lastName: string; phone: string; email: string; street: string; city: string; state: string; zipCode: string; country: string };
  createdAt: string;
  client?: { ip?: string; userAgent?: string };
  // Review (entered by the admin)
  review?: { followers?: number; followsUs?: boolean; dmReceived?: boolean; notes?: string; updatedAt?: string };
  approvedAt?: string;
  orderId?: string;
  awb?: string;
  rejectedAt?: string;
  rejectReason?: string;
  blocked?: boolean;
};

type Result<T> = ({ success: true } & T) | { success: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ success: false as const, error, status });

/** Days before the party the gift should leave the warehouse (about 3 days in transit). */
export const SHIP_DAYS_BEFORE = 4;
export const shipBy = (partyDate: string) => {
  const d = new Date(`${partyDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - SHIP_DAYS_BEFORE);
  return d.toISOString().slice(0, 10);
};
const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
/** Start of this week (Monday 00:00 India time) as an ISO timestamp. */
export function weekStartISO(now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - day);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60_000).toISOString();
}

async function scanAll(): Promise<any[]> {
  const items: any[] = [];
  let ExclusiveStartKey: any;
  do {
    const r = await docClient.send(new ScanCommand({ TableName: CLUB_TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export type ApplicationRow = ClubApplication & {
  shipBy: string;
  flags: string[]; // things to look at before approving
};

function withFlags(a: ClubApplication, all: ClubApplication[], minFollowers: number, blocked: Set<string>): ApplicationRow {
  const flags: string[] = [];
  const today = todayIST();
  const sb = shipBy(a.partyDate);
  if (a.status === "submitted") {
    if (sb < today) flags.push("Ship-by date passed");
    else if (sb === today) flags.push("Ship today");
    if (a.review?.followers !== undefined && a.review.followers < minFollowers) flags.push(`Below ${minFollowers.toLocaleString("en-IN")} followers`);
  }
  if (blocked.has(`BLOCK#ig:${a.instagram}`) || blocked.has(`BLOCK#phone:${a.whatsapp}`) || blocked.has(`BLOCK#phone:${a.address.phone}`)) flags.push("Blocked");
  const others = all.filter((o) => o.id !== a.id && (o.instagram === a.instagram || o.whatsapp === a.whatsapp));
  if (others.length) flags.push(`${others.length} other application${others.length === 1 ? "" : "s"} from this person`);
  return { ...a, shipBy: sb, flags };
}

export async function listApplications(): Promise<{ applications: ApplicationRow[]; approvedThisWeek: number; weeklyCap: number; minFollowers: number; blocks: any[] }> {
  const [items, { settings }] = await Promise.all([scanAll(), getClubSettings()]);
  const apps = items.filter((i) => String(i.pk).startsWith("APP#")) as ClubApplication[];
  const blocks = items.filter((i) => String(i.pk).startsWith("BLOCK#"));
  const blocked = new Set(blocks.map((b) => String(b.pk)));
  const week = weekStartISO();
  return {
    applications: apps.map((a) => withFlags(a, apps, settings.eligibility.minFollowers, blocked)),
    approvedThisWeek: apps.filter((a) => a.approvedAt && a.approvedAt >= week).length,
    weeklyCap: settings.programme.weeklyCap,
    minFollowers: settings.eligibility.minFollowers,
    blocks,
  };
}

export async function getApplication(id: string): Promise<ClubApplication | null> {
  const r = await docClient.send(new GetCommand({ TableName: CLUB_TABLE, Key: { pk: `APP#${id}` } }));
  return (r.Item as ClubApplication) || null;
}

/** Everything the detail page needs: the application, its checks, and the other applications from this person. */
export async function getApplicationDetail(id: string) {
  const list = await listApplications();
  const app = list.applications.find((a) => a.id === id);
  if (!app) return null;
  const { settings } = await getClubSettings();
  const createdDay = new Date(new Date(app.createdAt).getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const daysAhead = Math.round((Date.parse(`${app.partyDate}T00:00:00Z`) - Date.parse(`${createdDay}T00:00:00Z`)) / 86_400_000);
  const others = list.applications.filter((o) => o.id !== app.id && (o.instagram === app.instagram || o.whatsapp === app.whatsapp));
  const isBlocked = app.flags.includes("Blocked");
  return {
    app,
    others: others.map((o) => ({ id: o.id, status: o.status, createdAt: o.createdAt, occasionName: o.occasionName })),
    approvedThisWeek: list.approvedThisWeek,
    weeklyCap: list.weeklyCap,
    minFollowers: settings.eligibility.minFollowers,
    handle: settings.posting.instagramHandle,
    postWithinHours: settings.posting.postWithinHours,
    checks: {
      leadDays: { ok: daysAhead >= settings.eligibility.leadDaysMin, text: `Applied ${daysAhead} days before the occasion (needs ${settings.eligibility.leadDaysMin}+)` },
      reapply: { ok: !others.some((o) => Math.abs(Date.parse(o.createdAt) - Date.parse(app.createdAt)) < settings.eligibility.reapplyDays * 86_400_000), text: others.length ? `${others.length} other application(s) from this handle or number` : `No other application from this handle or number` },
      blocklist: { ok: !isBlocked, text: isBlocked ? "On the blocklist" : "Handle and phone numbers not blocked" },
    },
  };
}

const num = (v: any) => (v === "" || v === null || v === undefined ? undefined : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : NaN);

/** Saves the reviewer's notes and checks (followers, follows us, DM received). */
export async function saveReview(id: string, input: any): Promise<Result<{ app: ClubApplication }>> {
  const app = await getApplication(id);
  if (!app) return fail("Application not found", 404);
  const followers = num(input?.followers);
  if (Number.isNaN(followers)) return fail("Followers should be a number");
  const review = {
    followers,
    followsUs: input?.followsUs === true,
    dmReceived: input?.dmReceived === true,
    notes: typeof input?.notes === "string" ? input.notes.trim().slice(0, 2000) : "",
    updatedAt: new Date().toISOString(),
  };
  const r = await docClient.send(
    new UpdateCommand({ TableName: CLUB_TABLE, Key: { pk: app.pk }, UpdateExpression: "SET review = :r", ExpressionAttributeValues: { ":r": review }, ReturnValues: "ALL_NEW" }),
  );
  return { success: true, app: r.Attributes as ClubApplication };
}

/**
 * Approve: checks the follower count and this week's cap, takes one bottle out of stock,
 * creates the ₹0 order with a Delhivery shipment, and marks the application approved.
 * `override` skips the follower and weekly-cap checks (the admin confirmed it).
 */
export async function approveApplication(id: string, override = false): Promise<Result<{ app: ClubApplication; orderId: string; awb: string }>> {
  const app = await getApplication(id);
  if (!app) return fail("Application not found", 404);
  if (app.status !== "submitted") return fail(`This application is already ${app.status}`, 409);
  const { settings } = await getClubSettings();
  const { approvedThisWeek, blocks } = await listApplications();
  const blocked = new Set(blocks.map((b) => String(b.pk)));
  if (blocked.has(`BLOCK#ig:${app.instagram}`) || blocked.has(`BLOCK#phone:${app.whatsapp}`) || blocked.has(`BLOCK#phone:${app.address.phone}`)) {
    return fail("This person is on the blocklist. Unblock them first if this is a mistake.", 409);
  }
  if (!override) {
    if (app.review?.followers === undefined) return fail("Enter their follower count first (check their Instagram profile).");
    if (app.review.followers < settings.eligibility.minFollowers) {
      return fail(`@${app.instagram} has ${app.review.followers.toLocaleString("en-IN")} followers; the minimum is ${settings.eligibility.minFollowers.toLocaleString("en-IN")}.`, 422);
    }
    if (approvedThisWeek >= settings.programme.weeklyCap) return fail(`This week's cap of ${settings.programme.weeklyCap} gifts is reached.`, 422);
  }

  // Claim the application first so a double click can't create two orders.
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: CLUB_TABLE,
        Key: { pk: app.pk },
        UpdateExpression: "SET #s = :approving",
        ConditionExpression: "#s = :submitted",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":approving": "approving", ":submitted": "submitted" },
      }),
    );
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") return fail("Someone else is approving or has just reviewed this application. Reload the page.", 409);
    throw e;
  }
  const release = () =>
    docClient.send(new UpdateCommand({ TableName: CLUB_TABLE, Key: { pk: app.pk }, UpdateExpression: "SET #s = :submitted", ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: { ":submitted": "submitted" } }));

  // One bottle out of stock (only if there's one left).
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: VARIANTS_TABLE,
        Key: { PK: `VARIANT#${app.gift.variantId}` },
        UpdateExpression: "SET stock = stock - :one",
        ConditionExpression: "attribute_exists(PK) AND stock >= :one",
        ExpressionAttributeValues: { ":one": 1 },
      }),
    );
  } catch (e: any) {
    await release();
    if (e?.name === "ConditionalCheckFailedException") return fail(`${app.gift.name} is out of stock. Restock it first.`, 409);
    throw e;
  }
  const putBack = () =>
    docClient.send(new UpdateCommand({ TableName: VARIANTS_TABLE, Key: { PK: `VARIANT#${app.gift.variantId}` }, UpdateExpression: "SET stock = stock + :one", ExpressionAttributeValues: { ":one": 1 } }));

  const a = app.address;
  const label = app.labelName ? ` · label "${app.labelName}"` : "";
  let order;
  try {
    order = await createManualOrder({
      customOrderNumber: app.id,
      source: "club",
      firstName: a.firstName,
      lastName: a.lastName,
      email: app.email,
      phone: a.phone,
      address: a.street,
      city: a.city,
      state: a.state,
      pin: a.zipCode,
      items: [{ productName: `${app.gift.name} ${app.gift.size} (Hickoku Club gift${label})`, qty: 1, unitPrice: 0 }],
      declaredValue: app.gift.price,
      extra: {
        clubApplicationId: app.id,
        appliedOffers: [{ id: "club", name: "Hickoku Club gift", amount: app.gift.price }],
        items: [
          {
            productId: app.gift.productId,
            variantId: app.gift.variantId,
            sku: app.gift.sku,
            productName: `${app.gift.name} (Hickoku Club gift)`,
            size: app.gift.size,
            quantity: 1,
            price: 0,
            total: 0,
            image: app.gift.image,
            ...(app.labelName ? { labelName: app.labelName } : {}),
          },
        ],
      },
    });
  } catch (e) {
    await Promise.allSettled([putBack(), release()]);
    throw e;
  }
  if (!order.success) {
    await Promise.allSettled([putBack(), release()]);
    return fail(`Couldn't create the order: ${order.error}`, order.status);
  }

  const now = new Date().toISOString();
  const r = await docClient.send(
    new UpdateCommand({
      TableName: CLUB_TABLE,
      Key: { pk: app.pk },
      UpdateExpression: "SET #s = :approved, approvedAt = :now, orderId = :o, awb = :awb",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":approved": "approved", ":now": now, ":o": order.orderId, ":awb": order.waybill },
      ReturnValues: "ALL_NEW",
    }),
  );
  return { success: true, app: r.Attributes as ClubApplication, orderId: order.orderId, awb: order.waybill };
}

export async function rejectApplication(id: string, reason: string): Promise<Result<{ app: ClubApplication }>> {
  const app = await getApplication(id);
  if (!app) return fail("Application not found", 404);
  if (app.status !== "submitted") return fail(`This application is already ${app.status}`, 409);
  try {
    const r = await docClient.send(
      new UpdateCommand({
        TableName: CLUB_TABLE,
        Key: { pk: app.pk },
        UpdateExpression: "SET #s = :rejected, rejectedAt = :now, rejectReason = :why",
        ConditionExpression: "#s = :submitted",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":rejected": "rejected", ":submitted": "submitted", ":now": new Date().toISOString(), ":why": String(reason || "").trim().slice(0, 300) },
        ReturnValues: "ALL_NEW",
      }),
    );
    return { success: true, app: r.Attributes as ClubApplication };
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") return fail("This application was just reviewed by someone else. Reload the page.", 409);
    throw e;
  }
}

/**
 * Block: the Instagram handle and both phone numbers can't apply again (the storefront
 * checks these rows). A pending application is rejected at the same time.
 */
export async function blockApplicant(id: string, reason: string): Promise<Result<{ app: ClubApplication; blocked: string[] }>> {
  const app = await getApplication(id);
  if (!app) return fail("Application not found", 404);
  const why = String(reason || "").trim().slice(0, 300) || "Blocked by admin";
  const now = new Date().toISOString();
  const keys = [...new Set([`BLOCK#ig:${app.instagram}`, `BLOCK#phone:${app.whatsapp}`, `BLOCK#phone:${app.address.phone}`])];
  for (const pk of keys) {
    await docClient.send(new PutCommand({ TableName: CLUB_TABLE, Item: { pk, reason: why, fromApplication: app.id, createdAt: now } }));
  }
  let current = app;
  if (app.status === "submitted") {
    const r = await rejectApplication(id, why);
    if (r.success) current = r.app;
  }
  const r = await docClient.send(
    new UpdateCommand({ TableName: CLUB_TABLE, Key: { pk: app.pk }, UpdateExpression: "SET blocked = :t", ExpressionAttributeValues: { ":t": true }, ReturnValues: "ALL_NEW" }),
  );
  return { success: true, app: (r.Attributes as ClubApplication) || current, blocked: keys.map((k) => k.replace("BLOCK#", "")) };
}

/** Removes the blocks this application created (handle and phone numbers). */
export async function unblockApplicant(id: string): Promise<Result<{ app: ClubApplication }>> {
  const app = await getApplication(id);
  if (!app) return fail("Application not found", 404);
  for (const pk of new Set([`BLOCK#ig:${app.instagram}`, `BLOCK#phone:${app.whatsapp}`, `BLOCK#phone:${app.address.phone}`])) {
    await docClient.send(new DeleteCommand({ TableName: CLUB_TABLE, Key: { pk } }));
  }
  const r = await docClient.send(
    new UpdateCommand({ TableName: CLUB_TABLE, Key: { pk: app.pk }, UpdateExpression: "REMOVE blocked", ReturnValues: "ALL_NEW" }),
  );
  return { success: true, app: r.Attributes as ClubApplication };
}
