import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead } from "@/components/ui";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Thông báo của khách: đơn hoàn thành / hoàn một phần / huỷ / hoàn tiền — mở trang là đánh dấu đã đọc */
export default async function NotificationsPage() {
  const user = (await getCurrentUser())!;
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 50 });
  return (
    <div>
      <PageHead title="Thông báo" desc="Cập nhật về đơn hàng của bạn: hoàn thành, hoàn một phần, huỷ và hoàn tiền." />
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">Chưa có thông báo nào</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((n) => (
              <div key={n.id} className="px-5 py-4 flex items-start gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-slate-200" : "bg-brand-500"}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-slate-800">{n.title} <span className="text-slate-400 font-normal text-xs ml-2">{dt(n.createdAt)}</span></div>
                  <p className="text-sm text-slate-500 mt-0.5">{n.body}</p>
                </div>
                {n.link && <Link href={n.link} className="btn-ghost btn-sm shrink-0">Xem đơn</Link>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
