import { NextResponse } from "next/server";
import { getCheckoutSwitches, setCheckoutSwitch, CHECKOUT_SWITCHES } from "@/lib/checkoutSwitches";
import { APP_ENV } from "@/lib/env";
import { SETTINGS_TABLE } from "@/lib/aws";

export const dynamic = "force-dynamic";

// Checkout switches (Settings → Store details). The storefront picks changes up within ~30s.
export async function GET() {
  try {
    const switches = await getCheckoutSwitches();
    return NextResponse.json({ success: true, switches, meta: CHECKOUT_SWITCHES, env: APP_ENV, table: SETTINGS_TABLE });
  } catch (e) {
    const error = e as Error;
    console.error("Checkout switches load error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to load checkout switches" }, { status: 500 });
  }
}

// Body: { key: "shipping" | "delhivery" | "geolocation", value: boolean }
export async function PATCH(request: Request) {
  try {
    const { key, value } = await request.json();
    const switches = await setCheckoutSwitch(key, value);
    console.log(`[checkout switches] ${APP_ENV}: ${key} → ${value}`);
    return NextResponse.json({ success: true, switches });
  } catch (e) {
    const error = e as Error & { status?: number };
    console.error("Checkout switch save error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to save" }, { status: error.status || 500 });
  }
}
