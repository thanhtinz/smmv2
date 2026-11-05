import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { testAiConnection } from "@/lib/ai";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  const back = (key: string, text: string) =>
    NextResponse.redirect(new URL(`/admin/cau-hinh?${key}=${encodeURIComponent(text)}`, req.url));
  if (!me || me.role !== "ADMIN") return back("err", "Chỉ admin mới kiểm tra được kết nối AI");
  try {
    const reply = await testAiConnection();
    return back("msg", `Kết nối AI thành công — nhà cung cấp trả lời: "${reply}"`);
  } catch (e: any) {
    return back("err", `Kết nối AI thất bại: ${String(e?.message || e).slice(0, 200)}`);
  }
}
