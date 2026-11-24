import { NextResponse } from "next/server";
import { getClubSettings, getClubTerms, saveClubSettings } from "@/lib/club";
import { listProducts } from "@/lib/products";
import { APP_ENV } from "@/lib/env";
import { SETTINGS_TABLE } from "@/lib/aws";

// Club → Club settings: the programme's rules, the current terms and the perfumes
// that can be picked as gifts.
export async function GET() {
  try {
    const [{ settings, saved }, products] = await Promise.all([getClubSettings(), listProducts()]);
    const terms = await getClubTerms(settings.termsVersion);
    return NextResponse.json({
      success: true,
      settings,
      saved,
      terms,
      products: products.map((p) => ({ id: p.id, name: p.name, image: p.images[0] || null })),
      env: APP_ENV,
      table: SETTINGS_TABLE,
    });
  } catch (error: any) {
    console.error("Club settings load error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to load Club settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const settings = await saveClubSettings(await request.json());
    return NextResponse.json({ success: true, settings, saved: true });
  } catch (error: any) {
    console.error("Club settings save error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to save Club settings" }, { status: error.status || 500 });
  }
}
