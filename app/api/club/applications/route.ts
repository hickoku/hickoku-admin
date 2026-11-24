import { NextResponse } from "next/server";
import { listApplications } from "@/lib/clubApplications";
import { APP_ENV } from "@/lib/env";
import { CLUB_TABLE } from "@/lib/aws";

// Club → Applications: every application, with the week's approvals against the cap.
export async function GET() {
  try {
    const data = await listApplications();
    return NextResponse.json({ success: true, ...data, env: APP_ENV, table: CLUB_TABLE });
  } catch (error: any) {
    console.error("Club applications load error:", error);
    const missing = error?.name === "ResourceNotFoundException";
    return NextResponse.json(
      { success: false, error: missing ? `Table ${CLUB_TABLE} doesn't exist yet. Run scripts/create-club-table.mjs in the storefront repo.` : error.message || "Failed to load applications" },
      { status: 500 },
    );
  }
}
