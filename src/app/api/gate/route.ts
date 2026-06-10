import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

function hash(password: string): string {
  return createHash("sha256").update(`pp-dash:${password}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.json({ ok: true }); // gate disabled

  const form = await req.formData();
  const attempt = String(form.get("password") ?? "");
  const a = Buffer.from(hash(attempt));
  const b = Buffer.from(hash(password));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.redirect(new URL("/gate?error=1", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set("pp_dash_auth", hash(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
