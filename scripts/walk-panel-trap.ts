/**
 * Đi bộ các route để kiểm chứng "bẫy panel" (workstream A):
 *   npx tsx scripts/walk-panel-trap.ts
 * Mint JWT phiên cho admin seed rồi gọi các route Tín đi (login -> /admin,
 * /dashboard, /panel-admin, thiet-lap) với 2 loại Host: host chính (localhost)
 * và host lạ (mô phỏng domain deploy khi MAIN_HOST chưa set). In chuỗi redirect.
 * Tạm hạ admin_2fa_required trong lúc đi bộ (gate 2FA là CHỦ ĐÍCH, không thuộc
 * bug này) rồi khôi phục "1" ngay khi xong.
 */
import { SignJWT } from "jose";
import { prisma } from "../src/lib/db";
import { getSettings, setSetting } from "../src/lib/settings";

const BASE = process.env.WALK_BASE || "http://127.0.0.1:3000";

async function walk(path: string, host: string, cookie: string): Promise<string> {
  const chain: string[] = [];
  let url = `${BASE}${path}`;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { redirect: "manual", headers: { cookie, host } });
    chain.push(`${new URL(url).pathname} -> ${res.status}`);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, BASE).toString();
      continue;
    }
    const text = await res.text();
    if (text.includes("Cấu hình panel con lần đầu") || text.includes("Đường dẫn panel")) chain.push("BODY: OLD SLUG WIZARD");
    if (text.includes("Đăng ký website con")) chain.push("BODY: panel page (current wizard)");
    if (text.includes("Tổng quan") && new URL(url).pathname === "/admin") chain.push("BODY: admin home");
    break;
  }
  return chain.join("  |  ");
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) throw new Error("no admin seed");
  const secret = new TextEncoder().encode((process.env.AUTH_SECRET || "").replace(/^"|"$/g, ""));
  const token = await new SignJWT({ uid: admin.id, role: admin.role, username: admin.username, sv: admin.sessionVersion })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
  const cookie = `smmv2_session=${token}`;
  const prev = (await getSettings()).admin_2fa_required;
  await setSetting("admin_2fa_required", "0");
  try {
    console.log("== Host chính (127.0.0.1) ==");
    console.log("GET /admin        :", await walk("/admin", "127.0.0.1:3000", cookie));
    console.log("== Host lạ (deploy domain, MAIN_HOST trống) ==");
    console.log("GET /admin        :", await walk("/admin", "smmv2-zeta.vercel.app", cookie));
    console.log("GET /dashboard    :", await walk("/dashboard", "smmv2-zeta.vercel.app", cookie));
    console.log("GET /panel-admin  :", await walk("/panel-admin", "127.0.0.1:3000", cookie));
    console.log("GET thiet-lap     :", await walk("/dashboard/panel-cua-toi/thiet-lap", "127.0.0.1:3000", cookie));
  } finally {
    await setSetting("admin_2fa_required", prev || "1");
    console.log(`admin_2fa_required restored = ${prev || "1"}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
