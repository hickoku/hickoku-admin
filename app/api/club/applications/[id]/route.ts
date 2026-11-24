import { NextResponse } from "next/server";
import { approveApplication, blockApplicant, getApplicationDetail, rejectApplication, saveReview, unblockApplicant } from "@/lib/clubApplications";

type Ctx = { params: Promise<{ id: string }> };
const bad = (r: { error: string; status: number }) => NextResponse.json({ success: false, error: r.error }, { status: r.status });

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const detail = await getApplicationDetail(id);
    if (!detail) return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    return NextResponse.json({ success: true, ...detail });
  } catch (error: any) {
    console.error("Club application load error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to load the application" }, { status: 500 });
  }
}

// Reviewer's checks and notes.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const r = await saveReview(id, await request.json());
    return r.success ? NextResponse.json({ success: true, app: r.app }) : bad(r);
  } catch (error: any) {
    console.error("Club review save error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to save" }, { status: 500 });
  }
}

// { action: "approve" | "reject" | "block" | "unblock", reason?, override? }
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await request.json();
    const r =
      body.action === "approve"
        ? await approveApplication(id, body.override === true)
        : body.action === "reject"
          ? await rejectApplication(id, body.reason)
          : body.action === "block"
            ? await blockApplicant(id, body.reason)
            : body.action === "unblock"
              ? await unblockApplicant(id)
              : { success: false as const, error: "Unknown action", status: 400 };
    return r.success ? NextResponse.json(r) : bad(r);
  } catch (error: any) {
    console.error("Club application action error:", error);
    return NextResponse.json({ success: false, error: error.message || "Something went wrong" }, { status: 500 });
  }
}
