import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/* Phục vụ ảnh từ MediaAsset (DB). Mặc định trả BẢN ĐÃ ĐÓNG DẤU (nếu có) —
   mặt công khai không bao giờ nhận bản gốc của ảnh sản phẩm/banner.
   Bản gốc (?o=1) chỉ trả cho ADMIN đã đăng nhập. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Not found", { status: 404 });
  const row = await prisma.mediaAsset.findUnique({ where: { id } }).catch(() => null);
  if (!row) return new NextResponse("Not found", { status: 404 });

  const wantOriginal = req.nextUrl.searchParams.get("o") === "1";
  if (wantOriginal) {
    const me = await getCurrentUser().catch(() => null);
    if (!me || me.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });
    return new NextResponse(new Uint8Array(row.original), {
      headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=3600" },
    });
  }
  if (row.stamped) {
    return new NextResponse(new Uint8Array(row.stamped), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
    });
  }
  return new NextResponse(new Uint8Array(row.original), {
    headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=86400" },
  });
}
