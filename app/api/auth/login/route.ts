import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_TTL_MS, createSessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { success: false, error: "ADMIN_PASSWORD is not configured on the server." },
        { status: 500 },
      );
    }

    if (typeof password !== "string" || password !== adminPassword) {
      return NextResponse.json(
        { success: false, error: "Incorrect password" },
        { status: 401 },
      );
    }

    const token = await createSessionToken();
    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return res;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Login failed" },
      { status: 500 },
    );
  }
}
