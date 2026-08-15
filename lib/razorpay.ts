const RAZORPAY_BASE = "https://api.razorpay.com/v1";

function authHeader() {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
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
