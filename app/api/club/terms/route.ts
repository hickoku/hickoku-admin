import { NextResponse } from "next/server";
import { publishClubTerms } from "@/lib/club";

// Publish the Club terms as a new version ({ body }). Earlier versions are kept as
// they were; applications remember the version they accepted.
export async function POST(request: Request) {
  try {
    const { body } = await request.json();
    const { terms, settings } = await publishClubTerms(body);
    return NextResponse.json({ success: true, terms, settings });
  } catch (error: any) {
    console.error("Club terms publish error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to publish the terms" }, { status: error.status || 500 });
  }
}
