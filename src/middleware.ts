import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Access gate: every page and API route requires a session from Google
 * sign-in, restricted to verified @plusplus.co accounts (see src/auth.ts).
 */
export default auth((req) => {
  // Dev-only escape hatch for local tooling (Playwright screenshots).
  // Double-gated: NODE_ENV is never "development" in a production build,
  // and DEV_NO_AUTH is never set on Vercel.
  if (process.env.NODE_ENV === "development" && process.env.DEV_NO_AUTH === "1") {
    return NextResponse.next();
  }
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth") || pathname === "/signin") {
    return NextResponse.next();
  }
  if (req.auth?.user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "";
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|plusplus-logo.png).*)"],
};
