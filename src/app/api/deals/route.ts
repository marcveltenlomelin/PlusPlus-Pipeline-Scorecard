import { NextRequest, NextResponse } from "next/server";
import { getDeals } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get("refresh") === "1";
    const { payload, pilotStageId } = await getDeals({ force });
    return NextResponse.json({ ...payload, pilotStageId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "HubSpot sync failed" },
      { status: 502 }
    );
  }
}
