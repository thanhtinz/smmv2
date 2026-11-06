import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRealtimeFeed } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/** Feed thông báo realtime cho Panel Admin — chỉ sự kiện thuộc panel của chủ panel. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { getPanelAccess } = await import("@/lib/panel-access");
  const access = await getPanelAccess(user.id);
  if (!access) return NextResponse.json({ error: "No panel" }, { status: 404 });
  const feed = await getRealtimeFeed({ panelId: access.panel.id, panelAdmin: true });
  return NextResponse.json(feed);
}
