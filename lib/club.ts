import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, SETTINGS_TABLE } from "@/lib/aws";

// Hickoku Club: a free personalised perfume for a birthday or other occasion, in
// return for an Instagram Reel. These are the programme's rules, edited on
// Club → Club settings and kept in site-settings[-stage]:
//   id = "club"            the rules (one row, saved with "Save changes")
//   id = "club-terms#<n>"  each published version of the terms, never changed after
// Rule changes apply to new applications. Each application keeps the terms version
// it accepted, so publishing a new version never changes what someone agreed to.

export type ClubOccasion = { id: string; name: string; enabled: boolean };

export type ClubSettings = {
  programme: {
    open: boolean; // off = the storefront's apply button shows "Back soon"
    weeklyCap: number; // most gifts approved in one week
    featureDays: number; // how long a Reel stays on the homepage wall
  };
  eligibility: {
    minFollowers: number; // checked by the admin during review (Instagram doesn't expose it)
    leadDaysMin: number; // apply at least this many days before the occasion
    leadDaysMax: number; // ...and at most this many days before
    reapplyDays: number; // one application per Instagram handle in this many days
    adultsOnly: boolean; // applicant confirms they are 18+
  };
  occasions: ClubOccasion[]; // in the order the storefront lists them
  gift: {
    productIds: string[]; // perfumes the applicant can choose from
    nameLabel: boolean; // personalised name on the label
    nameMaxLength: number;
  };
  posting: {
    instagramHandle: string; // the account to tag
    postWithinHours: number; // after the occasion
    keepUpDays: number; // the Reel must stay up this long
    markNotPostedAfterDays: number; // no proof by then = "did not post"
    hashtags: string[];
    storyScreenshotRequired: boolean;
    autoBlockNoPost: boolean; // block the handle from applying again
  };
  featuring: {
    requireApproval: boolean; // feature a Reel only after the admin approves it
    homepageWall: boolean; // show the latest featured Reels on the homepage
    wallSize: number;
    shareImages: boolean; // make share images for featured Reels
  };
  termsVersion: number; // current published terms (0 = none yet)
  updatedAt?: string;
};

export type ClubTerms = { version: number; body: string; publishedAt: string };

export const DEFAULT_OCCASIONS = ["Birthday", "Anniversary", "Graduation", "Eid party", "Diwali party", "Farewell", "Wedding"];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export function defaultClubSettings(): ClubSettings {
  return {
    programme: { open: false, weeklyCap: 25, featureDays: 30 },
    eligibility: { minFollowers: 2000, leadDaysMin: 6, leadDaysMax: 60, reapplyDays: 30, adultsOnly: true },
    occasions: DEFAULT_OCCASIONS.map((name) => ({ id: slug(name), name, enabled: true })),
    gift: { productIds: [], nameLabel: true, nameMaxLength: 10 },
    posting: {
      instagramHandle: "@hickokuperfume",
      postWithinHours: 24,
      keepUpDays: 30,
      markNotPostedAfterDays: 5,
      hashtags: ["#hickoku", "#gifted"],
      storyScreenshotRequired: true,
      autoBlockNoPost: true,
    },
    featuring: { requireApproval: true, homepageWall: true, wallSize: 10, shareImages: true },
    termsVersion: 0,
  };
}

const KEY = { id: "club" };
const termsKey = (version: number) => ({ id: `club-terms#${version}` });

// Stored values win; anything missing (a rule added later) falls back to the default.
function merge(stored: any): ClubSettings {
  const d = defaultClubSettings();
  if (!stored) return d;
  return {
    programme: { ...d.programme, ...(stored.programme || {}) },
    eligibility: { ...d.eligibility, ...(stored.eligibility || {}) },
    occasions: Array.isArray(stored.occasions) ? stored.occasions : d.occasions,
    gift: { ...d.gift, ...(stored.gift || {}) },
    posting: { ...d.posting, ...(stored.posting || {}) },
    featuring: { ...d.featuring, ...(stored.featuring || {}) },
    termsVersion: Number(stored.termsVersion) || 0,
    updatedAt: stored.updatedAt,
  };
}

export async function getClubSettings(): Promise<{ settings: ClubSettings; saved: boolean }> {
  const res = await docClient.send(new GetCommand({ TableName: SETTINGS_TABLE, Key: KEY }));
  return { settings: merge(res.Item), saved: !!res.Item };
}

export async function getClubTerms(version: number): Promise<ClubTerms | null> {
  if (!version) return null;
  const res = await docClient.send(new GetCommand({ TableName: SETTINGS_TABLE, Key: termsKey(version) }));
  if (!res.Item) return null;
  return { version: Number(res.Item.version), body: String(res.Item.body || ""), publishedAt: String(res.Item.publishedAt || "") };
}

const bad = (message: string) => Object.assign(new Error(message), { status: 400 });
const str = (v: any, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: any, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
// Whole numbers in [min, max]; anything else is an error naming the field.
const int = (v: any, label: string, min: number, max: number) => {
  const n = Number(v);
  if (v === "" || v === null || v === undefined || !Number.isInteger(n) || n < min || n > max) {
    throw bad(`${label} should be a whole number from ${min} to ${max}`);
  }
  return n;
};

function cleanOccasions(input: any): ClubOccasion[] {
  if (!Array.isArray(input)) throw bad("Occasions are missing");
  const seen = new Set<string>();
  const out: ClubOccasion[] = [];
  for (const o of input.slice(0, 30)) {
    const name = str(o?.name, 40);
    if (!name) continue;
    let id = str(o?.id, 40) || slug(name) || "occasion";
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    out.push({ id, name, enabled: o?.enabled !== false });
  }
  if (!out.some((o) => o.enabled)) throw bad("Turn on at least one occasion");
  const names = new Set<string>();
  for (const o of out) {
    const k = o.name.toLowerCase();
    if (names.has(k)) throw bad(`"${o.name}" is in the occasions list twice`);
    names.add(k);
  }
  return out;
}

function cleanHashtags(input: any): string[] {
  const list = Array.isArray(input) ? input : String(input || "").split(/[\s,]+/);
  const tags = list
    .map((t: any) => str(t, 40).replace(/^#*/, ""))
    .filter((t: string) => t && /^[\p{L}\p{N}_]+$/u.test(t))
    .map((t: string) => `#${t}`);
  return [...new Set(tags)].slice(0, 10);
}

// Accepts the form's payload, keeps only known fields, checks them, and saves.
// The terms version is not taken from the form: only publishClubTerms changes it.
export async function saveClubSettings(input: any): Promise<ClubSettings> {
  const current = (await getClubSettings()).settings;
  const p = input?.programme || {};
  const e = input?.eligibility || {};
  const g = input?.gift || {};
  const po = input?.posting || {};
  const f = input?.featuring || {};

  const eligibility = {
    minFollowers: int(e.minFollowers, "Minimum followers", 0, 10_000_000),
    leadDaysMin: int(e.leadDaysMin, "Apply at least … days before", 0, 365),
    leadDaysMax: int(e.leadDaysMax, "Apply at most … days before", 1, 365),
    reapplyDays: int(e.reapplyDays, "One application every … days", 0, 365),
    adultsOnly: bool(e.adultsOnly, true),
  };
  if (eligibility.leadDaysMax <= eligibility.leadDaysMin) {
    throw bad("“At most … days before” must be more than “at least … days before”");
  }

  let handle = str(po.instagramHandle, 31).replace(/^@*/, "");
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) throw bad("Instagram handle should be letters, numbers, dots or underscores");
  handle = `@${handle.toLowerCase()}`;

  const productIds = Array.isArray(g.productIds) ? [...new Set(g.productIds.map((x: any) => str(x, 80)).filter(Boolean))].slice(0, 50) : [];

  const settings: ClubSettings = {
    programme: {
      open: bool(p.open, false),
      weeklyCap: int(p.weeklyCap, "Weekly gift cap", 1, 1000),
      featureDays: int(p.featureDays, "Feature on the wall for … days", 1, 365),
    },
    eligibility,
    occasions: cleanOccasions(input?.occasions),
    gift: {
      productIds: productIds as string[],
      nameLabel: bool(g.nameLabel, true),
      nameMaxLength: int(g.nameMaxLength, "Name on label, max letters", 1, 30),
    },
    posting: {
      instagramHandle: handle,
      postWithinHours: int(po.postWithinHours, "Post within … hours", 1, 24 * 14),
      keepUpDays: int(po.keepUpDays, "Keep the Reel up for … days", 1, 365),
      markNotPostedAfterDays: int(po.markNotPostedAfterDays, "Mark “did not post” after … days", 1, 60),
      hashtags: cleanHashtags(po.hashtags),
      storyScreenshotRequired: bool(po.storyScreenshotRequired, true),
      autoBlockNoPost: bool(po.autoBlockNoPost, true),
    },
    featuring: {
      requireApproval: bool(f.requireApproval, true),
      homepageWall: bool(f.homepageWall, true),
      wallSize: int(f.wallSize, "Homepage wall size", 1, 50),
      shareImages: bool(f.shareImages, true),
    },
    termsVersion: current.termsVersion,
    updatedAt: new Date().toISOString(),
  };
  if (settings.programme.open && settings.gift.productIds.length === 0) {
    throw bad("Pick at least one gift perfume before opening applications");
  }
  if (settings.programme.open && !settings.termsVersion) {
    throw bad("Publish the terms before opening applications");
  }

  await docClient.send(new PutCommand({ TableName: SETTINGS_TABLE, Item: { ...KEY, ...settings } }));
  return settings;
}

// Saves the terms as the next version and points the Club at it. The version row is
// written only if that number is free, so two admins publishing at once can't
// overwrite each other's text.
export async function publishClubTerms(body: any): Promise<{ terms: ClubTerms; settings: ClubSettings }> {
  const text = str(body, 20_000);
  if (text.length < 20) throw bad("Write the terms first (at least a couple of sentences)");
  const { settings, saved } = await getClubSettings();
  const latest = await getClubTerms(settings.termsVersion);
  if (latest && latest.body === text) throw bad(`No changes since v${latest.version}`);

  const terms: ClubTerms = { version: settings.termsVersion + 1, body: text, publishedAt: new Date().toISOString() };
  try {
    await docClient.send(
      new PutCommand({
        TableName: SETTINGS_TABLE,
        Item: { ...termsKey(terms.version), ...terms },
        ConditionExpression: "attribute_not_exists(id)",
      }),
    );
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      throw Object.assign(new Error("Someone else just published the terms. Reload and try again."), { status: 409 });
    }
    throw err;
  }
  const next: ClubSettings = { ...settings, termsVersion: terms.version, updatedAt: saved ? settings.updatedAt : terms.publishedAt };
  await docClient.send(new PutCommand({ TableName: SETTINGS_TABLE, Item: { ...KEY, ...next } }));
  return { terms, settings: next };
}
