import { NextResponse } from "next/server";
import { markNotPosted, requestFix, setFeatureHidden, verifyPost } from "@/lib/clubApplications";

// { action: "approve" | "feature" | "fix" | "not_posted" | "hide" | "show", note? }
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const r =
      body.action === "approve" || body.action === "feature"
        ? await verifyPost(id, body.action === "feature")
        : body.action === "fix"
          ? await requestFix(id, body.note)
          : body.action === "not_posted"
            ? await markNotPosted(id)
            : body.action === "hide" || body.action === "show"
              ? await setFeatureHidden(id, body.action === "hide")
              : { success: false as const, error: "Unknown action", status: 400 };
    return r.success ? NextResponse.json(r) : NextResponse.json({ success: false, error: r.error }, { status: r.status });
  } catch (error: any) {
    console.error("Club post action error:", error);
    return NextResponse.json({ success: false, error: error.message || "Something went wrong" }, { status: 500 });
  }
}
