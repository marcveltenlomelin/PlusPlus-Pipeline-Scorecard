import { NextRequest, NextResponse } from "next/server";
import { setDealSdr } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

/** Assign (or clear) a deal's sourcing SDR — writes through to HubSpot. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { dealId?: string; sdr?: string | null } | null;
  if (!body?.dealId || (body.sdr !== null && typeof body.sdr !== "string")) {
    return NextResponse.json({ error: "Expected { dealId, sdr: string | null }" }, { status: 400 });
  }
  try {
    await setDealSdr(body.dealId, body.sdr ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SDR write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
