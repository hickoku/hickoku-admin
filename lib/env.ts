// Which environment's data this admin works on, mirroring the storefront's
// APP_ENV switch:
//   APP_ENV=prod  → "orders", "site-settings", live Razorpay/Delhivery keys
//   APP_ENV=stage → "orders-stage", "site-settings-stage", stage keys
// If APP_ENV isn't set, a production build (`next build`/`next start`) means
// prod and `next dev` means stage, so running locally can't touch real data
// by accident.
export const APP_ENV: "prod" | "stage" =
  process.env.APP_ENV === "prod" || process.env.APP_ENV === "stage"
    ? process.env.APP_ENV
    : process.env.NODE_ENV === "production"
      ? "prod"
      : "stage";

export const IS_PROD = APP_ENV === "prod";

// Reads NAME_PROD / NAME_STAGE for the current environment. Prod also accepts
// the plain NAME (what the live admin was configured with before this
// switch). Stage never falls back to the plain NAME, because that holds live
// credentials.
export function envFor(name: string): string {
  if (IS_PROD) return process.env[`${name}_PROD`] || process.env[name] || "";
  return process.env[`${name}_STAGE`] || "";
}

export function requireEnvFor(name: string): string {
  const v = envFor(name);
  if (!v) throw new Error(`${name}_${IS_PROD ? "PROD" : "STAGE"} is not configured (APP_ENV=${APP_ENV})`);
  return v;
}
