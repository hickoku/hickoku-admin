import { NextResponse } from "next/server";
import { uploadProductImage } from "@/lib/productImages";

// One image per request (multipart field "file"), max 5 MB. Returns its URL.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "No file sent" }, { status: 400 });
    const r = await uploadProductImage(file, String(form.get("productKey") || ""));
    if ("error" in r) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, url: r.url });
  } catch (error: any) {
    console.error("Product image upload error:", error);
    return NextResponse.json({ success: false, error: error.message || "Upload failed" }, { status: 500 });
  }
}
