import { NextRequest, NextResponse } from "next/server";
import { patchStore, readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readStore());
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const store = await patchStore(body);
  return NextResponse.json(store);
}
