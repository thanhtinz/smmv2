import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { vnd, num, PRE_STATUS, dt, dshort } from "@/lib/format";
import { warrantyAction } from "@/app/actions/user";
const warrantyForm = warrantyAction;

export const dynamic = "force-dynamic";

export default async function MyPremiumOrders({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const orders = await prisma.premiumOrder.findMany({
    where: { userId: user.id },
    orderBy: { id: "desc" },
    take: 50,
    include: { variant: { include: { product: true } } },
  });
  return (
    <div>
      <PageHead title="Đơn Premium của tôi" desc="Nội dung tài khoản đã giao nằm trong từng đơn. Bảo hành: bấm nút Bảo hành ngay trong đơn khi tài khoản lỗi.">
        <Link href="/premium" className="btn-primary">+ Mua thêm</Link>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      {orders.length === 0 ? <Empty text="Bạn chưa mua sản phẩm premium nào" /> : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">{o.variant.product.name} — {o.variant.name} <span className="text-slate-400 font-mono text-xs font-normal ml-1">{o.code}</span></div>
                  <div className="text-xs text-slate-400 mt-1">{dt(o.createdAt)} · Số lượng {num(o.quantity)} · Tổng {vnd(o.total)}{o.warrantyUntil ? ` · Bảo hành đến ${dshort(o.warrantyUntil)}` : ""}</div>
                </div>
                <Badge cls={PRE_STATUS[o.status].cls}>{PRE_STATUS[o.status].label}</Badge>
              </div>
              {o.deliveryData ? (
                <pre className="mt-4 bg-slate-950 text-emerald-300 rounded-xl p-4 text-sm whitespace-pre-wrap break-all">{o.deliveryData}</pre>
              ) : (
                <p className="mt-3 text-sm text-slate-500">{o.status === "PENDING" ? "Đơn đang chờ giao — thường trong vòng 30 phút (giờ hành chính) đến vài giờ." : "Chưa có nội dung giao."}</p>
              )}
              {(o.status === "DELIVERED" || o.status === "COMPLETED") && o.warrantyUntil && o.warrantyUntil > new Date() && (
                <form action={warrantyForm} className="mt-4 flex flex-wrap gap-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <input className="inp !w-80" name="note" placeholder="Mô tả lỗi để yêu cầu bảo hành (vd: acc bị đăng xuất)" />
                  <button className="btn-ghost btn-sm !py-2.5">Yêu cầu bảo hành</button>
                </form>
              )}
              {o.buyerInfo && <p className="mt-2 text-xs text-slate-400">Thông tin nâng cấp: {o.buyerInfo}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
