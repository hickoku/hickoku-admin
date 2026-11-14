import { requireEnvFor } from "@/lib/env";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

// RAZORPAY_KEY_ID_STAGE/_PROD etc., picked by APP_ENV (see lib/env.ts).
function authHeader() {
  const id = requireEnvFor("RAZORPAY_KEY_ID");
  const secret = requireEnvFor("RAZORPAY_KEY_SECRET");
  const credentials = Buffer.from(`${id}:${secret}`).toString("base64");
  return `Basic ${credentials}`;
}

export async function razorpayFetch(path: string) {
  const res = await fetch(`${RAZORPAY_BASE}${path}`, {
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.description || `Razorpay API error: ${res.status}`);
  }
  return res.json();
}
