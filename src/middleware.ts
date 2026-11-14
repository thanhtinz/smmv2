import { NextRequest, NextResponse } from "next/server";

/**
 * Định tuyến theo subdomain — chuẩn tên miền con của hệ BNT (Tín ban
 * hành 2026-11-13, đợt 127): mọi bề mặt suy từ miền gốc đã cấu hình,
 * KHÔNG hardcode tên miền nào trong file này — middleware tự suy miền
 * gốc từ chính Host của request (bỏ tiền tố subdomain đã biết), nên
 * cùng một bản code chạy đúng trên bntshop.com, bản demo và localhost:
 *  - api.<gốc>     -> chỉ phục vụ API đại lý /api/v2 (+ CORS cho trình
 *                     duyệt của đại lý); mọi đường khác trả 404.
 *  - webhook.<gốc> -> chỉ phục vụ /api/webhooks/* (SePay/FZR/BoltUtil/
 *                     Stripe); mọi đường khác trả 404.
 *  - admin.<gốc>   -> gốc của khu quản trị: /... được viết lại sang
 *                     /admin/...; các đường dùng chung (đăng nhập, API,
 *                     media, tệp tĩnh) giữ nguyên.
 *  - Miền gốc + mọi host lạ: GIỮ NGUYÊN hành vi cũ — riêng /admin trên
 *    miền gốc sẽ 301 sang admin.<gốc> khi ADMIN_HOST_REDIRECT bật
 *    (bật ở phase 2, sau khi bề mặt admin.<gốc> đã kiểm chứng sống).
 * Endpoint máy (webhook, /api/v2) trên miền gốc KHÔNG bị ép chuyển
 * hướng — vẫn trả lời song song ở cả hai địa chỉ để không gãy callback
 * nạp tiền/API của đối tác đã khai báo địa chỉ cũ (chuyển hướng 301
 * làm nhiều hệ thống đối tác đánh rơi dữ liệu POST).
 */

const SUB_PREFIXES = ["api", "admin", "webhook", "dashboard", "doc", "www"];

/** Phase 2 (bật sau khi admin.<gốc> đã kiểm chứng): chuyển hướng 301
 *  /admin trên miền gốc sang admin.<gốc>. ĐÃ BẬT 2026-11-13 sau khi
 *  phase 1 kiểm chứng đủ bốn bề mặt trên bản live. */
const ADMIN_HOST_REDIRECT = true;

/** Đường dùng chung KHÔNG thuộc khu /admin — trên host admin. các
 *  đường này phải giữ nguyên (luồng đăng nhập/2FA/quên mật khẩu và
 *  trang hệ thống dùng chung cho cả web). */
const SHARED_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/step-up",
  "/setup",
  "/locked",
  "/admin-blocked",
];

function splitHost(req: NextRequest): { host: string; sub: string | null; root: string } {
  const host = (req.headers.get("host") || req.nextUrl.host || "").split(":")[0].toLowerCase();
  const parts = host.split(".");
  if (parts.length > 2 && SUB_PREFIXES.includes(parts[0])) {
    return { host, sub: parts[0], root: parts.slice(1).join(".") };
  }
  return { host, sub: null, root: host };
}

function notFoundJson() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

/** CSP bằng nonce (audit P3-02 đợt 2 = P3-03 đợt 1): script nội tuyến của
 *  hệ thống chỉ chạy khi mang nonce của đúng request đó — bỏ hẳn
 *  'unsafe-inline' khỏi script-src. Chế độ qua biến môi trường CSP_MODE:
 *  mặc định "report" (chỉ báo cáo, không chặn — dùng để rà soát false
 *  positive trên luồng thật), đặt "enforce" để khoá thật. style-src giữ
 *  'unsafe-inline' đợt này (Tailwind/inline style khắp nơi). */
function cspHeader(nonce: string): { key: string; value: string } {
  const value = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https:`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
  return {
    key: process.env.CSP_MODE === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value,
  };
}

function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** NextResponse.next/rewrite mang nonce xuống layout qua header x-nonce
 *  (Next tự gắn nonce này cho script của framework) + gắn CSP lên response. */
function withCsp(req: NextRequest, res: NextResponse, nonce: string): NextResponse {
  const { key, value } = cspHeader(nonce);
  res.headers.set(key, value);
  return res;
}

function nextWithNonce(req: NextRequest, nonce: string, rewriteTo?: URL): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  const res = rewriteTo
    ? NextResponse.rewrite(rewriteTo, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  return withCsp(req, res, nonce);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { host, sub, root } = splitHost(req);
  const nonce = newNonce();

  if (sub === "api") {
    if (pathname === "/api/v2" || pathname.startsWith("/api/v2/")) {
      if (req.method === "OPTIONS") {
        return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
      }
      const res = NextResponse.next();
      for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
      return res;
    }
    return notFoundJson();
  }

  if (sub === "webhook") {
    if (pathname.startsWith("/api/webhooks/")) return NextResponse.next();
    return notFoundJson();
  }

  if (sub === "admin") {
    // Đường đã thuộc khu quản trị / API / media / tệp tĩnh / đường dùng
    // chung -> giữ nguyên, không viết lại.
    if (
      pathname === "/admin" ||
      pathname.startsWith("/admin/") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/media/") ||
      pathname.startsWith("/brand/") ||
      pathname.startsWith("/home-strip/") ||
      SHARED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
      /\.[a-z0-9]+$/i.test(pathname)
    ) {
      return pathname.startsWith("/api/") ? NextResponse.next() : nextWithNonce(req, nonce);
    }
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/admin" : `/admin${pathname}`;
    return nextWithNonce(req, nonce, url);
  }

  // Miền gốc: phase 2 mới chuyển hướng khu admin sang admin.<gốc>.
  if (ADMIN_HOST_REDIRECT && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    const labels = host.split(".");
    const isRootHost = labels.length === 2 || host.startsWith("www.");
    if (isRootHost && root.split(".").length >= 2) {
      const url = req.nextUrl.clone();
      url.protocol = "https";
      url.hostname = `admin.${root}`;
      // Phải xoá cổng tường minh: nextUrl mang cổng nội bộ của app sau
      // reverse proxy (:3000) — không xoá là Location rò cổng này ra
      // ngoài (đã gặp thật ở lần bật đầu, 2026-11-13).
      url.port = "";
      return NextResponse.redirect(url, 301);
    }
  }

  // API trên miền gốc: không gắn CSP (chỉ dành cho trang HTML).
  if (pathname.startsWith("/api/")) return NextResponse.next();
  return nextWithNonce(req, nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
