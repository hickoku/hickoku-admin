import { NextResponse } from "next/server";
import { listProducts, saveProduct } from "@/lib/products";
import { PRODUCT_WRITES_ENABLED, PRODUCTS_TABLE } from "@/lib/aws";
import { uploadsEnabled } from "@/lib/productImages";
import { APP_ENV } from "@/lib/env";

export async function GET() {
  try {
    const products = await listProducts();
    return NextResponse.json({
      success: true,
      products,
      env: APP_ENV,
      table: PRODUCTS_TABLE,
      writable: PRODUCT_WRITES_ENABLED,
      uploadsEnabled: uploadsEnabled(),
    });
  } catch (error: any) {
    console.error("Products list error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to load products" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await saveProduct(await request.json());
    if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, product: result.product });
  } catch (error: any) {
    console.error("Product create error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to create product" }, { status: 500 });
  }
}
