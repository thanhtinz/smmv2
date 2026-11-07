import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAccessiblePanels, PANEL_COOKIE } from "@/lib/panel-access";

export const dynamic = "force-dynamic";

/** Chọn panel đang quản trị (khi tài khoản có nhiều website con): kiểm tra quyền,
 *  ghi cookie rồi chuyển vào Panel Admin. Dùng bởi nút "Quản trị" ở danh sách
 *  website con và bộ chọn panel trong Panel Admin. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const id = parseInt(req.nextUrl.searchParams.get("id") || "");
  const all = await listAccessiblePanels(user.id);
  const hit = all.find((x) => x.panel.id === id);
  const dest = new URL(hit ? "/panel-admin" : "/dashboard/panel-cua-toi", req.url);
  const res = NextResponse.redirect(dest);
  if (hit) {
    res.cookies.set(PANEL_COOKIE, String(id), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  return res;
}
