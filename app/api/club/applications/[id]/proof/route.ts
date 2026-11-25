import { getProofImage } from "@/lib/clubApplications";

// The applicant's Story screenshot. Admin-only (behind the admin login like every /api route).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const img = await getProofImage(id);
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=300" } });
}
