import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRealtimeFeed } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/** Feed thông báo realtime cho Admin web mẹ (chuông + toast trong layout admin). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "STAFF")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const feed = await getRealtimeFeed({});
  return NextResponse.json(feed);
}
