import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeUploadedImage } from "@/lib/media";

/* Endpoint tải ảnh DÙNG CHUNG cho mọi ô ảnh trong admin (đợt watermark
   2026-11-08). Chỉ ADMIN. FormData: file (ảnh), stamp ("0" = không đóng
   dấu — dành cho logo/favicon). Trả { ok, url, stamped } — url là
   /media/<id> bền trong DB; mặt công khai nhận bản đã đóng dấu. */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Chỉ quản trị viên mới tải ảnh lên được." }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Chưa chọn file ảnh." }, { status: 400 });
  }
  if (file.size > 6 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Ảnh tối đa 6MB." }, { status: 400 });
  }
  const stamp = String(form?.get("stamp") ?? "1") !== "0";
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await storeUploadedImage(buf, stamp);
    return NextResponse.json({ ok: true, url: stored.url, stamped: stored.stamped });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Tải ảnh thất bại." }, { status: 400 });
  }
}
