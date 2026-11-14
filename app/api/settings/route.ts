import { NextResponse } from "next/server";
import { getStoreSettings, saveStoreSettings, INVOICE_TOGGLES } from "@/lib/settings";
import { APP_ENV } from "@/lib/env";
import { SETTINGS_TABLE } from "@/lib/aws";

// Store details + invoice layout (Settings → Store details).
export async function GET() {
  try {
    const { settings, saved } = await getStoreSettings();
    return NextResponse.json({ success: true, settings, saved, toggles: INVOICE_TOGGLES, env: APP_ENV, table: SETTINGS_TABLE });
  } catch (error: any) {
    console.error("Settings load error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const settings = await saveStoreSettings(await request.json());
    return NextResponse.json({ success: true, settings, saved: true });
  } catch (error: any) {
    console.error("Settings save error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to save settings" }, { status: error.status || 500 });
  }
}
