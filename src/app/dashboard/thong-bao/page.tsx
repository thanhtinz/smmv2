import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { NOTIFY_CATEGORIES, parseNotifyPrefs } from "@/lib/notify";
import { saveNotifyPrefsAction } from "@/app/actions/user";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Thông báo của khách: đơn hoàn thành / hoàn một phần / huỷ / hoàn tiền — mở trang là đánh dấu đã đọc */
export default async function NotificationsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const { L, Ld } = await getServerI18n();
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 50 });
  const prefs = parseNotifyPrefs(user.notifyPrefs);
  return (
    <div>
      <PageHead title={L("Thông báo")} desc={L("Cập nhật về đơn hàng của bạn: hoàn thành, hoàn một phần, huỷ và hoàn tiền.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form action={saveNotifyPrefsAction} className="card mb-5 p-5">
        <div className="font-bold text-slate-900">{L("Tuỳ chỉnh loại thông báo")}</div>
        <p className="mt-1 text-sm text-slate-500">{L("Tắt loại thông báo bạn không muốn nhận. Thông báo bảo mật (đăng nhập thiết bị mới...) luôn được gửi.")}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {NOTIFY_CATEGORIES.map((c) => (
            <label key={c.key} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">
              <input type="checkbox" name={`np_${c.key}`} value="1" defaultChecked={prefs[c.key] !== false} /> {L(c.label)}
            </label>
          ))}
        </div>
        <button className="btn-primary mt-4">{L("Lưu tuỳ chỉnh")}</button>
      </form>
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">{L("Chưa có thông báo nào")}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((n) => (
              <div key={n.id} className="px-5 py-4 flex items-start gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-slate-200" : "bg-brand-500"}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-slate-800">{n.title} <span className="text-slate-400 font-normal text-xs ml-2">{dt(n.createdAt)}</span></div>
                  <p className="text-sm text-slate-500 mt-0.5">{n.body}</p>
                </div>
                {n.link && <Link href={n.link} className="btn-ghost btn-sm shrink-0">{L("Xem đơn")}</Link>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
