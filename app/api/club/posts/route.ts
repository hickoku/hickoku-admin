import { NextResponse } from "next/server";
import { listPosts } from "@/lib/clubApplications";

// Club → Posts & features: approved applications and where their Reel is.
export async function GET() {
  try {
    const { posts, settings } = await listPosts();
    return NextResponse.json({ success: true, posts, rules: { handle: settings.posting.instagramHandle, hashtags: settings.posting.hashtags, postWithinHours: settings.posting.postWithinHours, notPostedAfterDays: settings.posting.markNotPostedAfterDays, autoBlock: settings.posting.autoBlockNoPost, featureDays: settings.programme.featureDays } });
  } catch (error: any) {
    console.error("Club posts load error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to load posts" }, { status: 500 });
  }
}
