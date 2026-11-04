import { NextRequest, NextResponse } from "next/server";

/**
 * Nhận diện tên miền riêng của panel con: nếu Host không phải tên miền chính
 * và khớp domain của một panel đang mở, rewrite về gian hàng /cua-hang/[slug]
 * (giữ nguyên đường dẫn con). Mọi lỗi tra cứu đều cho qua như bình thường.
 */
export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const mainHost = (process.env.MAIN_HOST || "").toLowerCase();
  const isMain = !host || host === "localhost" || host === "127.0.0.1" || (mainHost && host === mainHost);
  const path = req.nextUrl.pathname;
  if (isMain || path.startsWith("/cua-hang") || path.startsWith("/api/")) return NextResponse.next();
  try {
    const url = new URL(`/api/panels/resolve?host=${encodeURIComponent(host)}`, req.url);
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (r.ok) {
      const { slug } = await r.json();
      if (slug) {
        const u = req.nextUrl.clone();
        u.pathname = `/cua-hang/${slug}${path === "/" ? "" : path}`;
        return NextResponse.rewrite(u);
      }
    }
  } catch {
    // tra cứu lỗi -> bỏ qua, site chính vẫn chạy bình thường
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
