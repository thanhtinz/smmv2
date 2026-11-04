import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, Badge } from "@/components/ui";
import { adminSaveProvider, adminDeleteProvider, adminProviderAction } from "@/app/actions/admin";
import { vnd, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminProviders({ searchParams }: { searchParams: { msg?: string; err?: string; edit?: string; preset?: string } }) {
  await requireAdminPage();
  const providers = await prisma.provider.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { services: true, orders: true } } } });
  const editFound = searchParams.edit ? providers.find((p) => p.id === parseInt(searchParams.edit!)) : undefined;
  const presetThatim = !editFound && searchParams.preset === "thatim";
  const edit: any = editFound || (presetThatim ? { name: "ThaTim", apiUrl: "https://thatim.vn/api/v2", kind: "BOTH", currency: "VND", exchangeRate: 1, markupPercent: 20, active: true, apiKey: "", note: "Nguồn ThaTim: hỗ trợ cả SMM v2 (services/add/status/refill + comments/reaction/minutes) và API mua sản phẩm (category/buy/history). Dán API key của tài khoản ThaTim của bạn vào ô API Key." } : undefined);
  return (
    <div>
      <PageHead title="Nhà cung cấp API (đấu API)" desc="Khai báo panel nguồn theo chuẩn SMM API v2 — hệ thống tự đồng bộ dịch vụ + giá (cộng markup), tự đẩy đơn và tự cập nhật trạng thái. Nguồn kiểu ThaTim còn đồng bộ được cả sản phẩm Premium.">
        <a href="/admin/nha-cung-cap?preset=thatim" className="btn-primary">+ Thêm nguồn ThaTim</a>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-4">
          {providers.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">{p.name} {!p.active && <Badge cls="bg-slate-200 text-slate-600">Đã tắt</Badge>} <Badge cls="bg-brand-100 text-brand-800">{p.kind === "BOTH" ? "SMM + Premium" : p.kind}</Badge></div>
                  <div className="text-xs text-slate-400 font-mono mt-1 break-all">{p.apiUrl}</div>
                  <div className="text-sm text-slate-500 mt-2">
                    Số dư ≈ <b className="text-slate-800">{vnd(p.balanceCache)}</b> · Tiền gốc {p.currency} × {p.exchangeRate.toLocaleString("vi-VN")} · Markup {p.markupPercent}% · {p._count.services} dịch vụ · {p._count.orders} đơn
                    {p.lastSyncAt && <> · Đồng bộ gần nhất {dt(p.lastSyncAt)}</>}
                  </div>
                  {p.note && <p className="text-xs text-slate-400 mt-1">{p.note}</p>}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <form action={adminProviderAction} className="flex gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn-ghost btn-sm" name="kind" value="balance">Kiểm tra số dư</button>
                    <button className="btn-primary btn-sm" name="kind" value="sync">Đồng bộ dịch vụ</button>
                  </form>
                  <div className="flex gap-2 justify-end">
                    <a href={`/admin/nha-cung-cap?edit=${p.id}`} className="btn-ghost btn-sm">Sửa</a>
                    <form action={adminDeleteProvider}><input type="hidden" name="id" value={p.id} /><button className="btn-ghost btn-sm !text-rose-600">Xoá</button></form>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {providers.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">Chưa có nhà cung cấp nào — thêm ở form bên cạnh để bắt đầu đấu API.</div>}
          <div className="card p-5 text-sm text-slate-500 leading-relaxed">
            <div className="font-bold text-slate-800 mb-2">Cách đấu API hoạt động</div>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>Bạn nạp tiền vào panel nguồn (ThaTim, slike hoặc bất kỳ panel chuẩn SMM v2 nào), lấy API key của họ.</li>
              <li>Khai báo ở đây: hệ thống gọi <span className="font-mono">action=services</span> để kéo toàn bộ dịch vụ, tự quy đổi tiền và cộng markup thành giá bán.</li>
              <li>Khách đặt đơn trên dịch vụ API: hệ thống tự gọi <span className="font-mono">action=add</span> sang nguồn, lưu mã đơn nguồn.</li>
              <li>Cron <span className="font-mono">/api/cron/sync</span> (5-10 phút/lần) gọi <span className="font-mono">action=status</span> cập nhật tiến độ; đơn Partial/Canceled được hoàn tiền tự động đúng phần chưa chạy.</li>
            </ol>
          </div>
        </div>
        <form action={adminSaveProvider} className="card p-6 space-y-4 xl:sticky xl:top-24">
          <div className="font-bold text-slate-900">{edit ? `Sửa: ${edit.name}` : "Thêm nhà cung cấp"}</div>
          <input type="hidden" name="id" value={edit?.id || 0} />
          <div><label className="lbl">Tên nhà cung cấp</label><input className="inp" name="name" required defaultValue={edit?.name || ""} placeholder="Vd: ThaTim, Slike" /></div>
          <div>
            <label className="lbl">Loại nguồn</label>
            <select className="inp" name="kind" defaultValue={edit?.kind || "BOTH"}>
              <option value="BOTH">Cả SMM + Premium (kiểu ThaTim)</option>
              <option value="SMM">Chỉ dịch vụ SMM</option>
              <option value="PREMIUM">Chỉ sản phẩm Premium</option>
            </select>
          </div>
          <div><label className="lbl">API URL</label><input className="inp font-mono" name="apiUrl" required defaultValue={edit?.apiUrl || ""} placeholder="https://panel-nguon.vn/api/v2" /></div>
          <div><label className="lbl">API Key của bạn tại panel nguồn</label><input className="inp font-mono" name="apiKey" required defaultValue={edit?.apiKey || ""} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Tiền gốc</label>
              <select className="inp" name="currency" defaultValue={edit?.currency || "VND"}><option value="VND">VND</option><option value="USD">USD</option></select>
            </div>
            <div><label className="lbl">Tỷ giá → VND</label><input className="inp" name="exchangeRate" type="number" required defaultValue={edit?.exchangeRate ?? 1} /></div>
            <div><label className="lbl">Markup % khi đồng bộ</label><input className="inp" name="markupPercent" type="number" required defaultValue={edit?.markupPercent ?? 30} /></div>
            <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} className="w-4 h-4" /> Đang bật</label>
          </div>
          <div><label className="lbl">Ghi chú</label><input className="inp" name="note" defaultValue={edit?.note || ""} /></div>
          <button className="btn-primary w-full">{edit ? "Lưu nhà cung cấp" : "Thêm nhà cung cấp"}</button>
          {edit && <a href="/admin/nha-cung-cap" className="btn-ghost w-full">Huỷ sửa</a>}
        </form>
      </div>
    </div>
  );
}
