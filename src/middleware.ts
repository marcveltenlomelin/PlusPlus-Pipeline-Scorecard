import { NextRequest, NextResponse } from "next/server";

/**
 * Access gate. Inactive while DASHBOARD_PASSWORD is unset (local preview).
 * Set the env var and every request must carry the auth cookie issued by
 * /api/gate — drop-in protection before this ever reaches a shared URL.
 */

async function expectedCookie(password: string): Promise<string> {
  const data = new TextEncoder().encode(`pp-dash:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/gate" || pathname === "/api/gate") return NextResponse.next();

  const cookie = req.cookies.get("pp_dash_auth")?.value;
  if (cookie && cookie === (await expectedCookie(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
