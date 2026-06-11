import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ADMIN_EMAILS } from "@/lib/config";
import { AnnotationError, applyAnnotationOp, readStore, writeStore } from "@/lib/store";
import type { AnnotationOp } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Chart-annotation mutations. The author identity comes from the session —
 * never from the request body — and ownership/admin rules are enforced in
 * applyAnnotationOp. Deliberately separate from /api/store's generic PATCH so
 * authorship can't be forged. Reads ride along on /api/store GET (annotations
 * are part of the Store document).
 */
async function actorEmail(): Promise<string | null> {
  const session = process.env.AUTH_SECRET ? await auth() : null;
  if (session?.user?.email) return session.user.email;
  // same double-gate as the middleware's dev bypass, so local Playwright works
  if (process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV === "development") {
    return "dev@plusplus.co";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const email = await actorEmail();
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const op = (await req.json().catch(() => null)) as AnnotationOp | null;
  if (!op || typeof op !== "object" || !("kind" in op)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const store = await readStore();
    const next = applyAnnotationOp(
      store,
      op,
      { email, isAdmin: ADMIN_EMAILS.includes(email) },
      { id: randomUUID(), now: Date.now() }
    );
    await writeStore(next);
    return NextResponse.json(next);
  } catch (err) {
    if (err instanceof AnnotationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Annotation write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
