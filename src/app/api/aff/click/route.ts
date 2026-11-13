import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { randomKey } from "@/lib/format";
import { AFF_COOKIE_REF, AFF_COOKIE_VID, affDayKey } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

/** Ghi nhận lượt click vào link giới thiệu (?aff=MÃ hoặc ?ref=MÃ trên mọi trang):
 *  - đặt cookie aff_ref (30 ngày) CHỈ khi chưa có (first-touch — không ghi đè
 *    người giới thiệu trước), cookie này là nguồn gắn giới thiệu khi đăng ký
 *    bên cạnh tham số ?ref= trên trang đăng ký;
 *  - đếm 1 click cho mỗi (người giới thiệu × khách thăm × ngày giờ VN),
 *    khách thăm nhận diện bằng cookie aff_vid (1 năm).
 *  Lỗi ở đây KHÔNG bao giờ chặn điều hướng của khách — trả {ok:false} êm. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || "").trim().toUpperCase().slice(0, 12);
    if (!code) return NextResponse.json({ ok: false });
    const settings = await getSettings().catch(() => null);
    if (!settings || settings.module_affiliate === "0") return NextResponse.json({ ok: false });

    const referrer = await prisma.user.findUnique({ where: { refCode: code }, select: { id: true } });
    if (!referrer) return NextResponse.json({ ok: false });

    let visitorId = req.cookies.get(AFF_COOKIE_VID)?.value || "";
    const res = NextResponse.json({ ok: true });
    if (!visitorId || visitorId.length > 40) {
      visitorId = randomKey(20);
      res.cookies.set(AFF_COOKIE_VID, visitorId, { maxAge: 365 * 86400, path: "/", sameSite: "lax" });
    }
    if (!req.cookies.get(AFF_COOKIE_REF)?.value) {
      res.cookies.set(AFF_COOKIE_REF, code, { maxAge: 30 * 86400, path: "/", sameSite: "lax" });
    }
    await prisma.affiliateClick.upsert({
      where: { referrerId_visitorId_dayKey: { referrerId: referrer.id, visitorId, dayKey: affDayKey() } },
      create: { referrerId: referrer.id, visitorId, dayKey: affDayKey() },
      update: {},
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false });
  }
}
