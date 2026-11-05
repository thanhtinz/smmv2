import Link from "next/link";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge, Stat, I } from "@/components/ui";
import { panelSaveModulesAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

type Addon = { key: string; name: string; desc: string; icon: React.ReactNode; features: string[]; tags: string[] };

const ADDONS: Addon[] = [
  { key: "sellSmm", name: "Đặt đơn SMM", desc: "Bán dịch vụ SMM cho khách của panel.", icon: I.cart, features: ["Khách đặt đơn ngay tại gian hàng", "Hoa hồng chênh lệch giá về chủ panel"], tags: ["Kinh doanh", "SMM"] },
  { key: "sellPremium", name: "Tài khoản Premium", desc: "Bán Premium cho khách của panel theo giá panel đặt.", icon: I.gem, features: ["Giá Premium riêng của panel", "Đơn Premium hiện trong quản trị panel"], tags: ["Kinh doanh", "Premium"] },
  { key: "moduleRegister", name: "Đăng ký tài khoản", desc: "Cho phép khách đăng ký mới ngay tại gian hàng.", icon: I.users, features: ["Đăng ký tại gian hàng", "Điều khoản riêng của panel"], tags: ["Tài khoản"] },
  { key: "moduleBulk", name: "Đặt hàng loạt", desc: "Trang dán nhiều dòng đơn cùng lúc cho khách của panel.", icon: I.layers, features: ["Dán nhiều link một lần đặt", "Báo giá tổng trước khi đặt"], tags: ["Khách hàng", "Đơn hàng"] },
  { key: "moduleSubscriptions", name: "Đăng ký định kỳ", desc: "Đơn hẹn giờ và lặp lại cho khách của panel.", icon: I.clock, features: ["Hẹn giờ / lặp lại theo chu kỳ", "Tự dừng khi đủ số lượt"], tags: ["Khách hàng", "Đơn hàng"] },
  { key: "moduleCampaigns", name: "Chiến dịch", desc: "Gom đơn theo chiến dịch có trần ngân sách.", icon: I.megaphone, features: ["Trần ngân sách mỗi chiến dịch"], tags: ["Khách hàng"] },
  { key: "modulePromo", name: "Mã giảm giá", desc: "Áp dụng mã giảm giá (của panel và của web mẹ) cho khách của panel.", icon: I.gift, features: ["Mã riêng của panel", "Giới hạn lượt dùng và thời hạn"], tags: ["Khách hàng", "Khuyến mãi"] },
  { key: "moduleAffiliate", name: "Kiếm tiền (Affiliate)", desc: "Hoa hồng giới thiệu cho khách của panel khi người họ giới thiệu mua hàng.", icon: I.money, features: ["% hoa hồng riêng của panel", "Thu hồi theo tỉ lệ khi hoàn tiền"], tags: ["Khách hàng", "Hoa hồng"] },
  { key: "moduleTickets", name: "Hỗ trợ / Ticket", desc: "Khách của panel mở ticket, chủ panel trả lời tại trang Ticket hỗ trợ.", icon: I.ticket, features: ["Ticket kèm đơn liên quan", "Thông báo khi có tin mới"], tags: ["Khách hàng", "Hỗ trợ"] },
  { key: "moduleApi", name: "API đại lý", desc: "Khách của panel dùng API /api/v2 bằng key của họ.", icon: I.key, features: ["Đặt đơn, tra trạng thái, số dư", "Tài liệu API tại gian hàng"], tags: ["API", "Đại lý"] },
  { key: "moduleBlog", name: "Bài viết", desc: "Bài viết riêng của gian hàng hiển thị cho khách.", icon: I.file, features: ["Bài viết của riêng panel", "Hiện trên trang chủ gian hàng"], tags: ["Nội dung"] },
];

/** Cửa hàng Addon của panel — cùng cách trình bày với web mẹ: mỗi tính năng một thẻ riêng.
 *  Lưu ý: web mẹ tắt tính năng nào ở Cửa hàng Addon hệ thống thì tính năng đó tắt cho mọi gian hàng. */
export default async function PanelModules({ searchParams }: { searchParams: { msg?: string; err?: string; f?: string; q?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const f = searchParams.f === "on" || searchParams.f === "off" ? searchParams.f : "all";
  const q = (searchParams.q || "").trim().toLowerCase();
  const isOn = (k: string) => (panel as unknown as Record<string, unknown>)[k] !== false;
  const onCount = ADDONS.filter((a) => isOn(a.key)).length;
  const items = ADDONS.filter((a) => {
    if (f === "on" && !isOn(a.key)) return false;
    if (f === "off" && isOn(a.key)) return false;
    if (q && !a.name.toLowerCase().includes(q) && !a.desc.toLowerCase().includes(q)) return false;
    return true;
  });
  const tabCls = (active: boolean) => `rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-brand-300"}`;
  return (
    <div>
      <PageHead title="Cửa hàng Addon & Tiện Ích Mở Rộng" desc="Bật / tắt từng tính năng cho khách của gian hàng. Web mẹ tắt tính năng nào ở hệ thống thì tính năng đó tắt cho mọi gian hàng.">
        <button className="btn-primary !py-2.5" form="panel-addons-form" type="submit">Lưu thay đổi</button>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Tổng Addon" value={String(ADDONS.length)} icon={I.layers} tone="brand" />
        <Stat label="Đang bật" value={String(onCount)} icon={I.check} tone="emerald" />
        <Stat label="Đang tắt" value={String(ADDONS.length - onCount)} icon={I.bell} tone="rose" />
        <Stat label="Phạm vi" value="Khách của panel" icon={I.panels} tone="violet" />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href="/panel-admin/mo-dun" className={tabCls(f === "all")}>Tất cả ({ADDONS.length})</Link>
        <Link href="/panel-admin/mo-dun?f=on" className={tabCls(f === "on")}>Đang bật ({onCount})</Link>
        <Link href="/panel-admin/mo-dun?f=off" className={tabCls(f === "off")}>Đang tắt ({ADDONS.length - onCount})</Link>
        <form method="get" className="ml-auto flex gap-2">
          {f !== "all" && <input type="hidden" name="f" value={f} />}
          <input name="q" defaultValue={searchParams.q || ""} placeholder="Tìm addon, tính năng..." className="inp !w-64" />
          <button className="btn-ghost !py-2">Tìm</button>
        </form>
      </div>
      <form id="panel-addons-form" action={panelSaveModulesAction}>
        {/* Addon bị lọc ẩn mà đang BẬT phải giữ trạng thái bằng input ẩn (action đọc thiếu = tắt). */}
        {ADDONS.filter((a) => !items.includes(a) && isOn(a.key)).map((a) => (
          <input key={a.key} type="hidden" name={a.key} value="on" />
        ))}
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {items.map((a) => {
            const on = isOn(a.key);
            return (
              <div key={a.key} className="card p-6">
                <div className="flex items-start gap-4">
                  <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${on ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{a.name}</span>
                      {on ? <Badge cls="bg-emerald-50 text-emerald-600">Đang bật</Badge> : <Badge cls="bg-slate-100 text-slate-500">Đang tắt</Badge>}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">{a.desc}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {a.features.map((ft) => (
                    <li key={ft} className="flex items-center gap-2 text-sm text-slate-600"><span className="text-emerald-500">{I.check}</span>{ft}</li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {a.tags.map((t) => <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{t}</span>)}
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">v1.0</span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" name={a.key} defaultChecked={on} className="h-5 w-5 accent-brand-600" />
                    <span className={`text-sm font-semibold ${on ? "text-emerald-600" : "text-slate-400"}`}>{on ? "Đang bật" : "Đang tắt"}</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        {items.length === 0 && <div className="card mt-5 p-8 text-center text-sm text-slate-400">Không có addon nào khớp bộ lọc.</div>}
        <div className="card mt-5 p-6">
          <label className="lbl">% hoa hồng giới thiệu riêng của panel (để trống = theo web mẹ)</label>
          <input name="affiliatePercent" type="number" min={0} max={100} defaultValue={panel.affiliatePercent ?? ""} placeholder="VD: 8" className="inp max-w-xs" />
        </div>
        <button className="btn-primary mt-5 w-full !py-3 md:w-auto">Lưu thay đổi</button>
      </form>
    </div>
  );
}
