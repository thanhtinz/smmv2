import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const USERNAME_RE = /^[a-z0-9-]{6,32}$/;

/** Kiểm tra trực tiếp cho wizard Tạo Child Panel: tên miền / tên đăng nhập / email
 *  còn trống hay không. Chỉ cho tài khoản đã đăng nhập. */
export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const out: Record<string, { ok: boolean; msg: string }> = {};

  const domainRaw = q.get("domain");
  if (domainRaw !== null) {
    const domain = domainRaw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    if (domain.length < 4 || !DOMAIN_RE.test(domain)) {
      out.domain = { ok: false, msg: "Tên miền chưa hợp lệ — chỉ chứa chữ thường, số, dấu chấm và gạch ngang (vd: myshop.vn)" };
    } else if (await prisma.childPanel.findFirst({ where: { domain } })) {
      out.domain = { ok: false, msg: "Tên miền này đã được đăng ký cho website con khác" };
    } else {
      out.domain = { ok: true, msg: `Domain ${domain} hợp lệ và sẵn sàng sử dụng` };
    }
  }

  const usernameRaw = q.get("username");
  if (usernameRaw !== null) {
    const username = usernameRaw.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      out.username = { ok: false, msg: "Tên đăng nhập phải 6-32 ký tự: chữ thường, số, dấu gạch ngang" };
    } else if (await prisma.user.findFirst({ where: { username } })) {
      out.username = { ok: false, msg: "Tên đăng nhập này đã có người dùng" };
    } else {
      out.username = { ok: true, msg: "Tên đăng nhập khả dụng" };
    }
  }

  const emailRaw = q.get("email");
  if (emailRaw !== null) {
    const email = emailRaw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      out.email = { ok: false, msg: "Email chưa đúng định dạng" };
    } else if (await prisma.user.findFirst({ where: { email } })) {
      out.email = { ok: false, msg: "Email này đã được đăng ký" };
    } else {
      out.email = { ok: true, msg: "Email khả dụng" };
    }
  }

  return NextResponse.json(out);
}
