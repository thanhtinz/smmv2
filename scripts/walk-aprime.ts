/**
 * Kiểm chứng A′ (bỏ child panel): tạo fixture panel (ChildPanel + user có
 * panelId + PanelStaff + ADMIN có panelId) rồi đi bộ các route bằng JWT phiên:
 * tài khoản dính panelId phải hành xử như khách web mẹ bình thường; các URL
 * panel cũ phải 404; route giữ lại phải 200. Dọn fixture khi xong.
 *   npx tsx scripts/walk-aprime.ts
 */
import { SignJWT } from "jose";
import { prisma } from "../src/lib/db";
import { setSetting } from "../src/lib/settings";

const BASE = process.env.WALK_BASE || "http://127.0.0.1:3000";
let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`PASS  ${name}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? " — " + extra : ""}`); }
}

async function mint(u: { id: number; role: string; username: string; sessionVersion: number }) {
  const secret = new TextEncoder().encode((process.env.AUTH_SECRET || "").replace(/^"|"$/g, ""));
  return new SignJWT({ uid: u.id, role: u.role, username: u.username, sv: u.sessionVersion })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
}

async function status(path: string, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: res.status, loc: res.headers.get("location") || "", body: await res.text() };
}

async function main() {
  // --- Fixture panel data (bảng giữ nguyên trong DB, không còn code nào đọc) ---
  const panel = await prisma.childPanel.create({
    data: { name: "Fixture Panel", slug: "fixture-panel", domain: "fixture.example.com", ownerId: 1, status: "ACTIVE" } as any,
  }).catch(async () => prisma.childPanel.findFirst({ where: { slug: "fixture-panel" } }));
  const panelId = (panel as any).id as number;
  const fxUser = await prisma.user.create({
    data: { username: "fxpaneluser", email: "fxuser@example.com", passwordHash: "x", role: "USER", panelId, status: "ACTIVE", balance: 100000, apiKey: "fxuserkey1", depositCode: "FXU1" } as any,
  });
  const fxAdmin = await prisma.user.create({
    data: { username: "fxpaneladmin", email: "fxadmin@example.com", passwordHash: "x", role: "ADMIN", panelId, status: "ACTIVE", balance: 0, apiKey: "fxadminkey1", depositCode: "FXA1" } as any,
  });
  await prisma.panelStaff.create({ data: { panelId, userId: fxUser.id, role: "OWNER" } as any }).catch(() => {});

  const prev2fa = await prisma.setting.findUnique({ where: { key: "admin_2fa_required" } });
  await setSetting("admin_2fa_required", "0");
  try {
    const userCookie = `smmv2_session=${await mint(fxUser as any)}`;
    const adminCookie = `smmv2_session=${await mint(fxAdmin as any)}`;

    let r = await status("/dashboard", userCookie);
    check("user panelId: /dashboard 200 không redirect panel", r.status === 200, `${r.status} ${r.loc}`);
    r = await status("/dashboard/dat-hang", userCookie);
    check("user panelId: trang đặt đơn SMM 200", r.status === 200, `${r.status}`);
    r = await status("/dashboard/telegram", userCookie);
    check("user panelId: trang Telegram 200 (not-configured cũng là 200)", r.status === 200, `${r.status}`);
    r = await status("/admin", adminCookie);
    check("ADMIN panelId: /admin 200 (bẫy đã chết)", r.status === 200, `${r.status} ${r.loc}`);
    r = await status("/dashboard", adminCookie);
    check("ADMIN panelId: /dashboard 200", r.status === 200, `${r.status}`);

    for (const p of ["/panel-admin", "/panel-admin/don-hang", "/dashboard/panel-cua-toi", "/dashboard/panel-cua-toi/thiet-lap", "/cua-hang/fixture-panel", "/api/panels/resolve", "/admin/panel-con"]) {
      r = await status(p, adminCookie);
      check(`route đã xoá ${p} -> 404`, r.status === 404, `${r.status}`);
    }
    for (const p of ["/", "/premium", "/login", "/gio-hang"]) {
      r = await status(p);
      check(`route giữ ${p} -> 200 (khách vãng lai)`, r.status === 200, `${r.status}`);
    }
    r = await status("/");
    check("trang chủ mới: có thẻ sản phẩm/cửa hàng Premium", /\/premium\//.test(r.body) || r.body.includes("Bán chạy nhất"));
    check("trang chủ mới: KHÔNG còn landing", !r.body.includes("landing_template") && !r.body.includes("Bắt đầu ngay"));

    // Webhook capture-only
    const wh = await fetch(`${BASE}/api/webhooks/fzr`, { method: "POST", headers: { "content-type": "application/json", "x-test": "1" }, body: JSON.stringify({ event: "test.ping", orderId: "ord_x" }) });
    check("webhook fzr không chữ ký -> 401, không xử lý", wh.status === 401);
    const log = await prisma.apiLog.findFirst({ where: { kind: "fzr_webhook" }, orderBy: { id: "desc" } });
    check("webhook vẫn được ghi ApiLog fzr_webhook (valid:false)", !!log && (log!.detail || "").includes("test.ping") && (log!.detail || "").includes('"valid":false'));
    if (log) await prisma.apiLog.delete({ where: { id: log.id } });

    // Cron không còn job panel — gọi với CRON_SECRET
    const cronSecret = (process.env.CRON_SECRET || "").replace(/^"|"$/g, "");
    const cr = await fetch(`${BASE}/api/cron/sync`, { headers: { "x-cron-secret": cronSecret } });
    check("cron /api/cron/sync chạy không lỗi", cr.status === 200, `${cr.status}`);
  } finally {
    await setSetting("admin_2fa_required", prev2fa?.value ?? "1");
    await prisma.panelStaff.deleteMany({ where: { panelId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [fxUser.id, fxAdmin.id] } } });
    await prisma.childPanel.delete({ where: { id: panelId } }).catch(() => {});
  }
  console.log(fail === 0 ? `\nALL PASS (${pass})` : `\n${fail} FAIL / ${pass} PASS`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
