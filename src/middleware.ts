import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Access gate: every page and API route requires a session from Google
 * sign-in, restricted to verified @plusplus.co accounts (see src/auth.ts).
 */
export default auth((req) => {
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
